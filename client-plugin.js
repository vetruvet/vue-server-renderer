'use strict';

/*  */

var isJS = function (file) { return /\.js(\?[^.]+)?$/.test(file); };

var isCSS = function (file) { return /\.css(\?[^.]+)?$/.test(file); };

var ref = require('chalk');
var red = ref.red;
var yellow = ref.yellow;
var webpack = require('webpack');

var prefix = "[vue-server-renderer-webpack-plugin]";
var warn = exports.warn = function (msg) { return console.error(red((prefix + " " + msg + "\n"))); };
var tip = exports.tip = function (msg) { return console.log(yellow((prefix + " " + msg + "\n"))); };

var isWebpack5 = !!(webpack.version && webpack.version[0] > 4);

var onEmit = function (compiler, name, stageName, hook) {
  if (isWebpack5) {
    // Webpack >= 5.0.0
    compiler.hooks.compilation.tap(name, function (compilation) {
      if (compilation.compiler !== compiler) {
        // Ignore child compilers
        return
      }
      var stage = webpack.Compilation[stageName];
      compilation.hooks.processAssets.tapAsync({ name: name, stage: stage }, function (assets, cb) {
        hook(compilation, cb);
      });
    });
  } else if (compiler.hooks) {
    // Webpack >= 4.0.0
    compiler.hooks.emit.tapAsync(name, hook);
  } else {
    // Webpack < 4.0.0
    compiler.plugin('emit', hook);
  }
};

var stripModuleIdHash = function (id) {
  if (isWebpack5) {
    // Webpack >= 5.0.0
    return id.replace(/\|\w+$/, '')
  }
  // Webpack < 5.0.0
  return id.replace(/\s\w+$/, '')
};

var getAssetName = function (asset) {
  if (typeof asset === 'string') {
    return asset
  }
  return asset.name
};

var hash = require('hash-sum');
var uniq = require('lodash.uniq');

var VueSSRClientPlugin = function VueSSRClientPlugin (options) {
  if ( options === void 0 ) options = {};

  this.options = Object.assign({
    filename: 'vue-ssr-client-manifest.json'
  }, options);
};

VueSSRClientPlugin.prototype.apply = function apply (compiler) {
    var this$1 = this;

  var stage = 'PROCESS_ASSETS_STAGE_ADDITIONAL';
  onEmit(compiler, 'vue-client-plugin', stage, function (compilation, cb) {
    var stats = compilation.getStats().toJson();

    var allFiles = uniq(stats.assets
      .map(function (a) { return a.name; }));

    var initialFiles = uniq(Object.keys(stats.entrypoints)
      .map(function (name) { return stats.entrypoints[name].assets; })
      .reduce(function (assets, all) { return all.concat(assets); }, [])
      .map(getAssetName)
      .filter(function (file) { return isJS(file) || isCSS(file); }));

    var asyncFiles = allFiles
      .filter(function (file) { return isJS(file) || isCSS(file); })
      .filter(function (file) { return initialFiles.indexOf(file) < 0; });

    var manifest = {
      publicPath: stats.publicPath,
      initial: initialFiles,
      async: asyncFiles,
      moduleChunk: {},
      chunkFiles: {},
      chunkSiblings: {},
    };

    stats.chunks.forEach(function (c) {
      manifest.chunkFiles[c.id] = c.files;
      manifest.chunkSiblings[c.id] = c.siblings;
    });

    stats.modules.forEach(function (m) {
      if (m.chunks.length === 1) {
        var id = stripModuleIdHash(m.identifier);
        manifest.moduleChunk[hash(id)] = m.chunks[0];
      }
    });

    var json = JSON.stringify(manifest, null, 2);
    compilation.assets[this$1.options.filename] = {
      source: function () { return json; },
      size: function () { return json.length; }
    };
    cb();
  });
};

module.exports = VueSSRClientPlugin;
