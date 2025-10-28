const express = require('express');
const http = require('http');
const bodyParser = require('body-parser')
const https = require('https');
const { WebSocketServerManager } = require('./wsServer/websocket');
const { SSL_OPTIONS, HTTP_PORT, HTTPS_PORT, HTTP_REDIRECT_PORT } = require('./config');
const ADM = require('./routes/ADM.js')
const MQF = require('./routes/MQF.js')
const INTEGRA = require('./routes/integra.js')
const LESSON = require('./routes/lesson.js')
require('dotenv').config();

const app = express();
app.set('view engine', 'ejs');
app.use(express.static('public'))

app.use(bodyParser.urlencoded({extended:false}))
app.use(bodyParser.json())

app.use('/', INTEGRA)
app.use('/MQF', MQF)
app.use('/ADM', ADM)
app.use('/lesson', LESSON)


const httpServer = http.createServer(app);
const httpsServer = https.createServer(SSL_OPTIONS, app);

WebSocketServerManager.init({ httpServer, httpsServer });

http.createServer((req,res)=>{
  res.writeHead(301,{Location:`https://${req.headers.host}${req.url}`});
  res.end();
}).listen(HTTP_REDIRECT_PORT);

httpServer.listen(HTTP_PORT, () => console.log(`HTTP em http://localhost:${HTTP_PORT}`));
httpsServer.listen(HTTPS_PORT, () => console.log(`HTTPS em https://localhost:${HTTPS_PORT}`));
