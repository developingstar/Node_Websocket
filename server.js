'use strict';

var http = require('http').Server(app);
var WebSocketServer = require('ws').Server;
var express = require('express');
var app = express();
var PORT = 3100;

var messages = [];
var clientSockets = new Array();
var jsonDeviceInfo = new Array();

var serverSocket = null;
var masterSocket = null;

var pendingCommand = {};

http.listen(process.env.PORT || 3000, function(){
    console.log('listening on *:' + process.env.PORT || 3000);
});

var wss = new WebSocketServer({server: http});

app.use('/static', express.static(__dirname + '/static'));
    
var bodyParser = require('body-parser')
app.use( bodyParser.json() );       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
    extended: true
}));

app.get('/', function(req, res){
    res.sendFile(__dirname + 'index.html');
});
  
wss.on('connection', function (ws) {
    console.log("Device is connected");    
    ws.on('message', function (message) {        
        message = JSON.parse(message);
        if(message.action == "register_server")                               
            registerServer(ws);
        else if(message.action == "register_client")            
            registerClient(ws, message);
        else if(message.action == "execute_command")         
            executeCommand(message);
        else if(message.action == "execute_result")            
            executeResult();             
    });

    ws.on('close', function(){        
        for(var key in clientSockets)
        {            
            if(clientSockets[key] == ws)
            {
                jsonDeviceInfo[key].state = 0;   
                if(jsonDeviceInfo[key].master == true)
                    masterSocket = null;                                     
                return;        
            }
        }

        if(ws == serverSocket)
            serverSocket = null;
    });
});

var executeResult = function(){
    var resultPacket = {};
    resultPacket.action = "execute_result";
    resultPacket.result = "Success";
    serverSocket.send(JSON.stringify(resultPacket))        
}
var executeCommand = function(message)
{
    console.log(message);            
    for(var key in jsonDeviceInfo)
    {
        if(key == message.nick_name)
        {
            if(jsonDeviceInfo[key].state == 1)
            {
                var clientSocket = clientSockets[message.nick_name];
                var commandPacket = {};
                commandPacket.action = "execute_command";
                commandPacket.command = message.command;
                commandPacket.url = message.url;
                clientSocket.send(JSON.stringify(commandPacket));                
                return;
            }
        }
    }

    pendingCommand["nick_name"] = message.nick_name;
    pendingCommand["command"] = message.command;
    pendingCommand["url"] = message.url;
    pendingCommand["state"] = "pending";
    
    if(masterSocket != null)
    {
        var commandPacket = {};        
        commandPacket.action = "wakeup_device";
        commandPacket.nick_name = message.nick_name;     
        masterSocket.send(JSON.stringify(commandPacket));                         
        return;
    }
    
    var resultPacket = {};
    resultPacket.action = "execute_result";
    resultPacket.result = "Failure";
    serverSocket.send(JSON.stringify(resultPacket))        
}

var registerServer = function(ws)
{    
    serverSocket = ws;
    var keyArray = new Array();
    for(var key in jsonDeviceInfo)
    {
        keyArray.push(key);
    }
    var message = {};
    message.action = "init_devices";
    message.device_list = keyArray;

    serverSocket.send(JSON.stringify(message));    
} 

var registerClient = function(ws, message)
{  
    console.log("RegiserClient");
    var existFlag = false;

    for(var key in jsonDeviceInfo)
    {
        if(key == message.nick_name)
            existFlag = true;
    }    

    if(!existFlag)
    {
        var deviceInfo = new Array();
        deviceInfo.master = message.master;
        deviceInfo.state = 1;        
        jsonDeviceInfo[message.nick_name] = deviceInfo;                
        if(serverSocket != null)
        {
            var data = {};
            data.action = "add_device";  
            data.nick_name = message.nick_name;
            serverSocket.send(JSON.stringify(data));
        }
    }
    else
        jsonDeviceInfo[message.nick_name].state = 1;                

    clientSockets[message.nick_name] = ws;
    if(message.master == true)
        masterSocket = ws;
            
    if(message.nick_name == pendingCommand.nick_name && pendingCommand.state == "pending")
    {
        var data = {};
        data.action = "execute_command";
        data.command = pendingCommand.command;
        data.url = pendingCommand.url;
        ws.send(JSON.stringify(data));       
        pendingCommand.state = "done";                
    }
}

console.log('Server listening at port %d', http.address().port);
