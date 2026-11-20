(function (global) {
  "use strict";

  const settings = Object.freeze({
    // Messungen ungenauer als das werden komplett ignoriert.
    maxDisplayAccuracy: 1000,
    // Nur so genaue Messungen schalten Gebiete frei.
    maxRecordAccuracy: 40,
    // Ohne gültige Messung so lange: neues Segment, keine Verbindungslinie.
    gapMilliseconds: 60000,
    // Absolute Obergrenze (Zug/Autobahn), ~324 km/h.
    maxSpeed: 90,
    // Mindestgeschwindigkeit, die der Ausreisser-Filter immer erlaubt.
    minAllowedSpeed: 15,
    // Ab so vielen zusammenpassenden "Ausreissern" ist der Standort echt.
    relocateAfterRejects: 3,
    // Modus-Erkennung mit Hysterese (m/s): ab ~25 km/h Fahrzeug, unter ~14 km/h zu Fuss.
    vehicleEnterSpeed: 7,
    vehicleLeaveSpeed: 4,
    // Abstand zwischen gespeicherten Punkten.
    recordStep: { walking: 20, vehicle: 60 },
    // Längere gerade Verbindungen werden nicht freigeschaltet.
    maxCorridorLength: 300,
  });

  function calculateDistance(first, second) {
    const earthRadius = 6371000;
    const latitudeDifference = ((second.latitude - first.latitude) * Math.PI) / 180;
    const longitudeDifference = ((second.longitude - first.longitude) * Math.PI) / 180;
    const firstLatitude = (first.latitude * Math.PI) / 180;
    const secondLatitude = (second.latitude * Math.PI) / 180;
    const value =
      Math.sin(latitudeDifference / 2) ** 2 +
      Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(longitudeDifference / 2) ** 2;
    return earthRadius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
  }

  function isValidSpeed(speed) {
    return Number.isFinite(speed) && speed >= 0 && speed <= settings.maxSpeed * 1.5;
  }

  function createLocationFilter(now = () => Date.now()) {
    let lastFix = null;
    let filtered = null;
    let speedEstimate = 0;
    let mode = "walking";
    let lastRecorded = null;
    let rejectedFixes = [];
    let recentFixes = [];

    function reset() {
      lastFix = null;
      filtered = null;
      speedEstimate = 0;
      mode = "walking";
      lastRecorded = null;
      rejectedFixes = [];
      recentFixes = [];
    }

    function allowedDistance(from, to, seconds) {
      const reportedSpeed = isValidSpeed(to.speed) ? to.speed * 1.5 + 5 : 0;
      const allowedSpeed = Math.min(
        settings.maxSpeed,
        Math.max(settings.minAllowedSpeed, speedEstimate * 2 + 10, reportedSpeed),
      );
      return allowedSpeed * Math.max(seconds, 1) + from.accuracy + to.accuracy;
    }

    function isOutlier(fix) {
      if (!lastFix) {
        return false;
      }
      const seconds = (fix.timestamp - lastFix.timestamp) / 1000;
      const distance = calculateDistance(lastFix, fix);
      if (seconds * 1000 > settings.gapMilliseconds) {
        // Nach einer Lücke nur unmögliche Geschwindigkeiten verwerfen.
        return distance - fix.accuracy - lastFix.accuracy > settings.maxSpeed * seconds;
      }
      return distance > allowedDistance(lastFix, fix, seconds);
    }

    // Mehrere "Ausreisser" hintereinander, die untereinander zusammenpassen,
    // bedeuten: Das GPS hat sich neu gefunden (z. B. nach einem Tunnel).
    // Zusammenpassend heisst: Zwischen ihnen liegt keine unmögliche
    // Geschwindigkeit. So erholt sich der Filter auch, wenn er die
    // aktuelle Geschwindigkeit unterschätzt hat (z. B. Zug ohne Tempo-Angabe).
    function isConsistent(from, to) {
      const seconds = Math.max((to.timestamp - from.timestamp) / 1000, 1);
      const distance = calculateDistance(from, to) - from.accuracy - to.accuracy;
      return distance <= settings.maxSpeed * seconds;
    }

    // Gibt die aus den Ausreissern geschätzte Geschwindigkeit zurück,
    // sobald sie sich bestätigt haben, sonst null.
    function handleRejectedFix(fix) {
      const previous = rejectedFixes[rejectedFixes.length - 1];
      if (previous && !isConsistent(previous, fix)) {
        rejectedFixes = [];
      }
      rejectedFixes.push(fix);
      if (rejectedFixes.length < settings.relocateAfterRejects) {
        return null;
      }
      const first = rejectedFixes[0];
      const seconds = (fix.timestamp - first.timestamp) / 1000;
      return seconds > 0 ? Math.min(settings.maxSpeed, calculateDistance(first, fix) / seconds) : 0;
    }

    function updateSpeed(fix, startsSegment) {
      if (startsSegment) {
        recentFixes = [];
      }
      recentFixes.push(fix);
      while (recentFixes.length > 2 && fix.timestamp - recentFixes[1].timestamp >= 10000) {
        recentFixes.shift();
      }

      let sample = null;
      if (isValidSpeed(fix.speed)) {
        sample = fix.speed;
      } else if (!startsSegment) {
        // Geschwindigkeit über ~10 s schätzen, damit Messrauschen kaum zählt.
        const base = recentFixes[0];
        const seconds = (fix.timestamp - base.timestamp) / 1000;
        if (base !== fix && seconds >= 3) {
          const distance = Math.max(
            0,
            calculateDistance(base, fix) - (fix.accuracy + base.accuracy) / 2,
          );
          sample = Math.min(settings.maxSpeed, distance / seconds);
        }
      }
      if (sample === null) {
        return;
      }
      speedEstimate = startsSegment ? sample : speedEstimate * 0.7 + sample * 0.3;

      if (mode === "walking" && speedEstimate >= settings.vehicleEnterSpeed) {
        mode = "vehicle";
      } else if (mode === "vehicle" && speedEstimate < settings.vehicleLeaveSpeed) {
        mode = "walking";
      }
    }

    // Einfacher Kalman-Filter pro Achse: Genaue Messungen und schnelle
    // Bewegung ziehen stark, ungenaue Messungen im Stand kaum.
    function updatePosition(fix, seconds, startsSegment) {
      if (!filtered || startsSegment) {
        filtered = {
          latitude: fix.latitude,
          longitude: fix.longitude,
          variance: fix.accuracy ** 2,
        };
        return;
      }
      const processNoise = Math.max(2, speedEstimate * 1.2) * Math.max(seconds, 0.5);
      const variance = filtered.variance + processNoise ** 2;
      const gain = variance / (variance + fix.accuracy ** 2);
      filtered = {
        latitude: filtered.latitude + (fix.latitude - filtered.latitude) * gain,
        longitude: filtered.longitude + (fix.longitude - filtered.longitude) * gain,
        variance: variance * (1 - gain),
      };
    }

    function buildRecord(fix, startsSegment) {
      if (fix.accuracy > settings.maxRecordAccuracy) {
        return null;
      }
      const position = { latitude: filtered.latitude, longitude: filtered.longitude };

      if (!lastRecorded) {
        lastRecorded = { ...position, timestamp: fix.timestamp };
        return { position, previous: null, distance: 0 };
      }

      const distance = calculateDistance(lastRecorded, position);
      const recordGap =
        startsSegment ||
        fix.timestamp - lastRecorded.timestamp > settings.gapMilliseconds ||
        distance > settings.maxCorridorLength;

      if (!recordGap && distance < settings.recordStep[mode]) {
        return null;
      }

      // Über eine Lücke zählt die Distanz, es wird aber kein gerader
      // Streifen freigeschaltet.
      const previous = recordGap ? null : { latitude: lastRecorded.latitude, longitude: lastRecorded.longitude };
      lastRecorded = { ...position, timestamp: fix.timestamp };
      return { position, previous, distance };
    }

    function process(rawFix) {
      const fix = {
        latitude: Number(rawFix.latitude),
        longitude: Number(rawFix.longitude),
        accuracy: Number(rawFix.accuracy),
        speed: rawFix.speed === null || rawFix.speed === undefined ? null : Number(rawFix.speed),
        timestamp: Number.isFinite(rawFix.timestamp) && rawFix.timestamp > 0 ? rawFix.timestamp : now(),
      };

      if (
        !Number.isFinite(fix.latitude) ||
        !Number.isFinite(fix.longitude) ||
        Math.abs(fix.latitude) > 90 ||
        Math.abs(fix.longitude) > 180 ||
        !Number.isFinite(fix.accuracy) ||
        fix.accuracy <= 0
      ) {
        return { type: "invalid" };
      }

      if (fix.accuracy > settings.maxDisplayAccuracy) {
        return { type: "inaccurate", accuracy: fix.accuracy };
      }

      // Doppelte oder veraltete Messungen nie verwenden.
      if (lastFix && fix.timestamp <= lastFix.timestamp) {
        return { type: "stale", accuracy: fix.accuracy };
      }

      let startsSegment = !lastFix;

      let confirmedSpeed = null;
      if (isOutlier(fix)) {
        confirmedSpeed = handleRejectedFix(fix);
        if (confirmedSpeed === null) {
          return { type: "outlier", accuracy: fix.accuracy };
        }
        // Standort hat sich bestätigt: neu ansetzen, ohne Linie und Distanz.
        startsSegment = true;
        lastRecorded = null;
      } else if (lastFix && fix.timestamp - lastFix.timestamp > settings.gapMilliseconds) {
        startsSegment = true;
      }
      rejectedFixes = [];

      const seconds = lastFix ? (fix.timestamp - lastFix.timestamp) / 1000 : 0;
      if (confirmedSpeed !== null) {
        // Geschwindigkeit aus den bestätigten Messungen übernehmen.
        updateSpeed({ ...fix, speed: isValidSpeed(fix.speed) ? fix.speed : confirmedSpeed }, true);
      } else {
        updateSpeed(fix, startsSegment);
      }
      updatePosition(fix, seconds, startsSegment);
      lastFix = fix;

      return {
        type: "accepted",
        position: { latitude: filtered.latitude, longitude: filtered.longitude },
        accuracy: fix.accuracy,
        speed: speedEstimate,
        mode,
        startsSegment,
        record: buildRecord(fix, startsSegment),
      };
    }

    return { process, reset, getMode: () => mode };
  }

  global.createLocationFilter = createLocationFilter;
  global.locationFilterSettings = settings;
  global.calculateGeoDistance = calculateDistance;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { createLocationFilter, settings, calculateDistance };
  }
})(typeof window !== "undefined" ? window : globalThis);
