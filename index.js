const express = require('express');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { WebSocketServerManager } = require('./wsServer/websocket');
const { SSL_OPTIONS, HTTP_PORT, HTTPS_PORT, HTTP_REDIRECT_PORT } = require('./config');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (_, res) => res.sendFile(path.join(__dirname, 'public', 'landpage.html')));
app.get('/app', (_, res) => res.sendFile(path.join(__dirname, 'public', 'app.html')));

const httpServer = http.createServer(app);
const httpsServer = https.createServer(SSL_OPTIONS, app);

WebSocketServerManager.init({ httpServer, httpsServer });

http.createServer((req,res)=>{
  res.writeHead(301,{Location:`https://${req.headers.host}${req.url}`});
  res.end();
}).listen(HTTP_REDIRECT_PORT);

httpServer.listen(HTTP_PORT, () => console.log(`HTTP em http://localhost:${HTTP_PORT}`));
httpsServer.listen(HTTPS_PORT, () => console.log(`HTTPS em https://localhost:${HTTPS_PORT}`));
