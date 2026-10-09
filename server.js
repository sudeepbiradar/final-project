/**
 * LiveMail Classifier - Root Entrypoint Wrapper
 * Allows running `node server.js` directly from the project root.
 */
const path = require('path');
process.chdir(path.join(__dirname, 'server'));
require('./server/server.js');
