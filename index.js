const { dirname, resolve } = require('path');
const { readdir, stat } = require('fs');
const { promisify } = require('util');

const toStats = promisify(stat);
const toRead = promisify(readdir);

module.exports = async function (start, callback) {
	let dir = resolve('.', start);
	let tmp, stats = await toStats(dir);

	if (!stats.isDirectory()) {
		dir = dirname(dir);
	}

	while (true) {
		tmp = await callback(dir, await toRead(dir));
		if (tmp) return resolve(dir, tmp);
		dir = dirname(tmp = dir);
		if (tmp === dir) break;
	}
}

const express = require('express');
const path = require('path');
const app = express();

// server.js (Node.js)
require('dotenv').config();

app.get('/api/key', (req, res) => {
  console.log('API_KEY:', process.env.API_KEY);
  console.log('DATABASE_URL:', process.env.DATABASE_URL);
  res.json({
    apiKey: process.env.API_KEY || 'clé_non_définie',
    databaseUrl: process.env.DATABASE_URL || 'url_non_définie'
  });
});


// Servir tous les fichiers statiques
app.use(express.static('.'));

// Route principale vers wall.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'codage.html'));
});

app.listen(8000, () => {
    console.log('Serveur sur http://localhost:8000');
});
