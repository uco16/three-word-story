const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);

app.get('/', (req, res) => {
  res.sendFile(__dirname + "/home.html");
});

const sessionUrlPrefix = "/session/";
app.get(sessionUrlPrefix + ':sessionId', (req, res) => {
  if (!allSessions.hasOwnProperty(req.params.sessionId)) {
    res.writeHead(200, {'Content-Type': 'text/plain'});
    res.end('Session does not exist!');
    return;
  }
  res.sendFile(__dirname + "/game.html");
});

class Session {
  constructor(numPlayers, numRoundsToPlay, sessionId) {
    this.numPlayers = numPlayers;
    this.numRoundsToPlay = numRoundsToPlay;
    this.remainingSpaces = numPlayers;
    this.id = sessionId;

    this.players = {};
    this.stories = [];
    for (let i = 0; i < this.numPlayers; i++) {
      this.stories.push([]);
    }
    this.round = 0;
    this.gameIsRunning = false;

    this.playersWhoResponded = new Set();
  }
  addPlayer(socket) {
    socket.join(this.id);
    this.players[socket.id] = Object.keys(this.players).length;
    this.remainingSpaces -= 1;

    // handle player sending in their three words
    socket.on("message", (msg) => {
      if (!(this.gameIsRunning) || (this.playersWhoResponded.has(socket.id))) {
        return;
      }
      console.log(this.players[socket.id])
      console.log(this.round)
      console.log(this.numPlayers)
      var index = (this.players[socket.id] + this.round)%this.numPlayers;
      console.log("Saving this message in story " + index);
      this.stories[index].push(msg);
      this.playersWhoResponded.add(socket.id);

      if (this.playersWhoResponded.size === this.numPlayers) {
        this.startNextRound();
      }
    });

    // handle going through stories in the end game
    socket.on("next story", (msg) => {
      io.to(this.id).emit("next story");
    });

    if (this.isFull()) {
      this.startGame();
    } else {
      console.log("Remaining spaces in session " + this.id + ": " + this.remainingSpaces);
      io.to(this.id).emit("remaining spaces", this.remainingSpaces);
    }
  }
  getLastThreeWordsToBeShownToPlayer(socketId) {
    var index = (this.players[socketId] + this.round)%this.numPlayers;
    var story = this.stories[index];
    var lastThreeWords = story[story.length-1];
    return lastThreeWords;
  }
  startNextRound() {
    console.log("Stories of round " + this.round + ": " + this.stories);
    this.playersWhoResponded.clear();
    this.round += 1;

    if (this.round === this.numRoundsToPlay) {
      this.endGame();
      return;
    }

    console.log("Starting round " + this.round);
    for (var socketId in this.players) {
      var words = this.getLastThreeWordsToBeShownToPlayer(socketId);
      io.to(socketId).emit("message", words);
    }
  }
  isFull() {
    return this.remainingSpaces === 0;
  }
  endGame() {
    console.log("Ending game in session " + this.id + " with players " + Object.keys(this.players));
    this.gameIsRunning = false;
    io.to(this.id).emit("end game", this.stories);
  }
  startGame() {
    console.log("Starting game in session " + this.id + " with players " + Object.keys(this.players));
    this.gameIsRunning = true;
    io.to(this.id).emit("start game");
  }
};

var sessionCounter = 0;
var allSessions = {};

io.on("connection", (socket) => {
  console.log(socket.id + " connected");

  socket.onAny((eventName, ...args) => {
    console.log("Server recevied '" + eventName + "': " + args);
  });

  socket.on("new session", (numPlayers, numRoundsToPlay) => {
    sessionCounter += 1;
    var sessionId = sessionCounter.toString();

    var session = new Session(parseInt(numPlayers), parseInt(numRoundsToPlay), sessionId);
    allSessions[sessionId] = session;
    io.to(socket.id).emit("redirect", sessionUrlPrefix + session.id);
  });
  
  socket.on("disconnect", () => {
    console.log(socket.id + " disconnected");
  });

  socket.on("try join", (sessionId) => {
    tryJoin(socket, sessionId);
  });
});

function tryJoin(socket, sessionId) {
  console.log(socket.id + " tries to join session " + sessionId);
  if (!allSessions.hasOwnProperty(sessionId)) {
    console.log("Does not exist.");
    return;
  }
  var session = allSessions[sessionId];
  if (session.isFull()) {
    console.log("Is Full");
    io.to(socket.id).emit("session full");
    return;
  }
  session.addPlayer(socket);
};

server.listen(3000, () => {
  console.log('listening on *:3000');
});
