const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const webDirectory = path.join(projectRoot, 'www');
const files = ['index.html', 'manifest.json', 'service-worker.js'];
const directories = ['assets', 'css', 'js'];

fs.rmSync(webDirectory, { recursive: true, force: true });
fs.mkdirSync(webDirectory, { recursive: true });

files.forEach((file) => {
  fs.copyFileSync(path.join(projectRoot, file), path.join(webDirectory, file));
});

directories.forEach((directory) => {
  fs.cpSync(
    path.join(projectRoot, directory),
    path.join(webDirectory, directory),
    { recursive: true }
  );
});

const leafletSource = path.join(projectRoot, 'node_modules', 'leaflet', 'dist');
fs.cpSync(leafletSource, path.join(projectRoot, 'vendor', 'leaflet'), {
  recursive: true
});
fs.cpSync(leafletSource, path.join(webDirectory, 'vendor', 'leaflet'), {
  recursive: true
});
