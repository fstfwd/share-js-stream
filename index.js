'use strict';

var KEEP_ALIVE = 30 * 1000;
var Duplex     = require('stream').Duplex;
var inherits   = require('util').inherits;

/**
 * A Stream for managing communication between a ShareJS client and a ws client
 *
 *     var http          = require('http');
 *     var livedb        = require('livedb');
 *     var share         = require('share');
 *     var ShareJSStream = require('share-js-stream');
 *     var WsServer      = require('ws').Server;
 *
 *     http.createServer().listen(process.env.PORT, function onListen() {
 *       var wsServer = new WsServer({ server: this });
 *       wsServer.on('connection', onConnection);
 *     });
 *
 *     function onConnection(conn) {
 *       var stream = new ShareJSStream(conn);
 *       share.server
 *         .createClient({ backend: livedb.client(livedb.memory()) })
 *         .listen(stream);
 *     }
 *
 * @class ShareJSStream
 * @extends Duplex
 * @constructor
 * @param {WebSocket} ws a websocket connection
 * @param {Object} [options] options for configuring the stream
 * @param {Number} [options.keepAlive=30000] a keep alive interval (in ms) on
 *   which the stream will send a `null` message to the client
 */
function ShareJSStream(ws, options) {
  options = options || {};
  options.keepAlive = options.keepAlive !== undefined ?
    options.keepAlive : KEEP_ALIVE;

  this.ws            = ws;
  this.headers       = this.ws.upgradeReq.headers;
  this.remoteAddress = this.ws.upgradeReq.connection.remoteAddress;

  Duplex.call(this, { objectMode: true });

  this.ws.on('close',   this.onWsClose.bind(this));
  this.ws.on('message', this.onWsMessage.bind(this));

  this.on('error', this.onStreamError.bind(this));
  this.on('end',   this.onStreamEnd.bind(this));

  if (options.keepAlive) {
    this.keepAliveInterval = setInterval(this.keepAlive.bind(this),
                                         options.keepAlive);
  }
}

inherits(ShareJSStream, Duplex);

/**
 * Send a `null` message to the ws so that the connection is kept alive.
 *
 * This may not be necessary on all platforms.
 *
 * @method keepAlive
 * @private
 */
ShareJSStream.prototype.keepAlive = function keepAlive() {
  this.ws.send(null);
};

/**
 * Send a JSON-encoded message to the ws client.
 *
 * @method messageWsClient
 * @private
 * @param {Object} msg the message to send to the client
 */
ShareJSStream.prototype.messageWsClient = function messageWsClient(msg) {
  msg = JSON.stringify(msg);
  this.ws.send(msg);
};

/**
 * Handle a closed ws client.
 *
 * This is called when the `close` event is emitted on the ws client. It:
 *
 * - Clears the keep alive interval (if there is one)
 * - Pushes `null` to end the stream
 * - Emits `close` on the stream
 * - Closes the ws client
 *
 * @method onWsClose
 * @private
 * @param {Number} code the reason code for why the client was closed
 * @param {String} message a message accompanying the close
 */
ShareJSStream.prototype.onWsClose = function onWsClose(code, message) {
  if (this.keepAliveInterval) {
    clearInterval(this.keepAliveInterval);
  }

  this.push(null);
  this.emit('close');
  this.ws.close(code, message);
};

/**
 * Push a message received on the ws client as an object to the stream.
 *
 * @method onWsMessage
 * @private
 * @param {String} msg a JSON-encoded message received on the ws client
 */
ShareJSStream.prototype.onWsMessage = function onWsMessage(msg) {
  msg = JSON.parse(msg);
  this.push(msg);
};

/**
 * Handle the stream ending by closing the ws client connection.
 *
 * @method onStreamEnd
 * @private
 */
ShareJSStream.prototype.onStreamEnd = function onStreamEnd() {
  this.client.close();
};

/**
 * Handle a stream error by closing the ws client connection.
 *
 * @method onStreamError
 * @private
 * @param {Error} err the error emitted on the stream
 */
ShareJSStream.prototype.onStreamError = function onStreamError(err) {
  this.client.close(err);
};

/**
 * A no-op read operation for the stream.
 *
 * This is a no-op because _write immediately messages the ws client, rather
 * than pushing the message into a queue.
 *
 * @method _read
 * @private
 */
ShareJSStream.prototype._read = function _read() {
  // no-op
};

/**
 * Write a message to the stream.
 *
 * @method _write
 * @private
 * @param {Object} msg a message to be written to the stream
 * @param {String} encoding the encoding type (ignored)
 * @param {Function} cb a callback called when the `msg` is written
 */
ShareJSStream.prototype._write = function _write(msg, encoding, cb) {
  this.messageWsClient(msg);
  cb();
};

module.exports = ShareJSStream;
