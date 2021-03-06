/**
 * @file node-ral
 * @author hefangshi@baidu.com
 * http://fis.baidu.com/
 * 2014/8/5
 */

'use strict';

var Protocol = require('../../protocol.js');
var logger = require('../../logger.js')('HttpProtocol');
var util = require('util');
var Stream = require('stream').Stream;
var urlencode = require('urlencode');

function HttpProtocol() {
    Protocol.call(this);
}

util.inherits(HttpProtocol, Protocol);

HttpProtocol.prototype.getName = function () {
    return 'http';
};

HttpProtocol.prototype.normalizeConfig = HttpProtocol.normalizeConfig = function (config) {
    config = Protocol.normalizeConfig(config);
    if (typeof config.query !== 'object') {
        config.query = urlencode.parse(config.query, {
            charset: config.encoding
        });
    }
    if (config.path && config.path[0] !== '/') {
        config.path = '/' + config.path;
    }
    return config;
};

HttpProtocol.prototype._request = function (config, callback) {
    var response = new ResponseStream();
    var query = urlencode.stringify(config.query, {
        charset: config.encoding
    });
    var piped = false;
    var path;
    if (query) {
        path = config.path + '?' + query;
    }
    else {
        path = config.path;
    }
    var opt = {
        host: config.server.host,
        port: config.server.port,
        path: path,
        method: config.method,
        headers: config.headers,
        // disable http pool to avoid connect problem https://github.com/mikeal/request/issues/465
        agent: false
    };

    var request;

    if (config.https) {
        request = require('https');
        opt.key = config.key;
        opt.cert = config.cert;
        opt.rejectUnauthorized = config.rejectUnauthorized;
    }
    else {
        request = require('http');
    }

    logger.trace('request start ' + JSON.stringify(opt));
    var req = request.request(opt, function (res) {
        if (res.statusCode >= 300 && !config.ignoreStatusCode) {
            req.emit('error', new Error('Server Status Error: ' + res.statusCode));
        }
        res.pipe(response);
        callback && callback(response);
    });
    if (config.payload) {
        req.write(config.payload);
        req.end();
    }
    else {
        // auto end if no pipe
        process.nextTick(function () {
            piped || req.end();
        });
    }
    req.on('pipe', function () {
        piped = true;
    });
    return req;
};

function ResponseStream() {
    this.writable = true;
    this.data = null;
    this.chunks = [];
}

util.inherits(ResponseStream, Stream);

ResponseStream.prototype.write = function (chunk) {
    // store the data
    this.chunks.push(chunk);
};

ResponseStream.prototype.end = function () {
    var data = null;
    try {
        data = Buffer.concat(this.chunks);
        this.chunks = [];
        logger.trace('response end');
    }
    catch (ex) {
        logger.trace('response failed errmsg=' + ex.message);
        this.emit('error', ex);
        return;
    }
    // emit data at once
    this.emit('data', data);
    this.emit('end');
};

module.exports = HttpProtocol;
