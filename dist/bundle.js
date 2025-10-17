/******/ (() => { // webpackBootstrap
/******/ 	"use strict";
/******/ 	var __webpack_modules__ = ({

/***/ 460:
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

// ESM COMPAT FLAG
__webpack_require__.r(__webpack_exports__);

// EXPORTS
__webpack_require__.d(__webpack_exports__, {
  favoriteDB: () => (/* binding */ favoriteDB)
});

;// ./node_modules/idb/build/wrap-idb-value.js
const instanceOfAny = (object, constructors) => constructors.some((c) => object instanceof c);

let idbProxyableTypes;
let cursorAdvanceMethods;
// This is a function to prevent it throwing up in node environments.
function getIdbProxyableTypes() {
    return (idbProxyableTypes ||
        (idbProxyableTypes = [
            IDBDatabase,
            IDBObjectStore,
            IDBIndex,
            IDBCursor,
            IDBTransaction,
        ]));
}
// This is a function to prevent it throwing up in node environments.
function getCursorAdvanceMethods() {
    return (cursorAdvanceMethods ||
        (cursorAdvanceMethods = [
            IDBCursor.prototype.advance,
            IDBCursor.prototype.continue,
            IDBCursor.prototype.continuePrimaryKey,
        ]));
}
const cursorRequestMap = new WeakMap();
const transactionDoneMap = new WeakMap();
const transactionStoreNamesMap = new WeakMap();
const transformCache = new WeakMap();
const reverseTransformCache = new WeakMap();
function promisifyRequest(request) {
    const promise = new Promise((resolve, reject) => {
        const unlisten = () => {
            request.removeEventListener('success', success);
            request.removeEventListener('error', error);
        };
        const success = () => {
            resolve(wrap_idb_value_wrap(request.result));
            unlisten();
        };
        const error = () => {
            reject(request.error);
            unlisten();
        };
        request.addEventListener('success', success);
        request.addEventListener('error', error);
    });
    promise
        .then((value) => {
        // Since cursoring reuses the IDBRequest (*sigh*), we cache it for later retrieval
        // (see wrapFunction).
        if (value instanceof IDBCursor) {
            cursorRequestMap.set(value, request);
        }
        // Catching to avoid "Uncaught Promise exceptions"
    })
        .catch(() => { });
    // This mapping exists in reverseTransformCache but doesn't doesn't exist in transformCache. This
    // is because we create many promises from a single IDBRequest.
    reverseTransformCache.set(promise, request);
    return promise;
}
function cacheDonePromiseForTransaction(tx) {
    // Early bail if we've already created a done promise for this transaction.
    if (transactionDoneMap.has(tx))
        return;
    const done = new Promise((resolve, reject) => {
        const unlisten = () => {
            tx.removeEventListener('complete', complete);
            tx.removeEventListener('error', error);
            tx.removeEventListener('abort', error);
        };
        const complete = () => {
            resolve();
            unlisten();
        };
        const error = () => {
            reject(tx.error || new DOMException('AbortError', 'AbortError'));
            unlisten();
        };
        tx.addEventListener('complete', complete);
        tx.addEventListener('error', error);
        tx.addEventListener('abort', error);
    });
    // Cache it for later retrieval.
    transactionDoneMap.set(tx, done);
}
let idbProxyTraps = {
    get(target, prop, receiver) {
        if (target instanceof IDBTransaction) {
            // Special handling for transaction.done.
            if (prop === 'done')
                return transactionDoneMap.get(target);
            // Polyfill for objectStoreNames because of Edge.
            if (prop === 'objectStoreNames') {
                return target.objectStoreNames || transactionStoreNamesMap.get(target);
            }
            // Make tx.store return the only store in the transaction, or undefined if there are many.
            if (prop === 'store') {
                return receiver.objectStoreNames[1]
                    ? undefined
                    : receiver.objectStore(receiver.objectStoreNames[0]);
            }
        }
        // Else transform whatever we get back.
        return wrap_idb_value_wrap(target[prop]);
    },
    set(target, prop, value) {
        target[prop] = value;
        return true;
    },
    has(target, prop) {
        if (target instanceof IDBTransaction &&
            (prop === 'done' || prop === 'store')) {
            return true;
        }
        return prop in target;
    },
};
function replaceTraps(callback) {
    idbProxyTraps = callback(idbProxyTraps);
}
function wrapFunction(func) {
    // Due to expected object equality (which is enforced by the caching in `wrap`), we
    // only create one new func per func.
    // Edge doesn't support objectStoreNames (booo), so we polyfill it here.
    if (func === IDBDatabase.prototype.transaction &&
        !('objectStoreNames' in IDBTransaction.prototype)) {
        return function (storeNames, ...args) {
            const tx = func.call(unwrap(this), storeNames, ...args);
            transactionStoreNamesMap.set(tx, storeNames.sort ? storeNames.sort() : [storeNames]);
            return wrap_idb_value_wrap(tx);
        };
    }
    // Cursor methods are special, as the behaviour is a little more different to standard IDB. In
    // IDB, you advance the cursor and wait for a new 'success' on the IDBRequest that gave you the
    // cursor. It's kinda like a promise that can resolve with many values. That doesn't make sense
    // with real promises, so each advance methods returns a new promise for the cursor object, or
    // undefined if the end of the cursor has been reached.
    if (getCursorAdvanceMethods().includes(func)) {
        return function (...args) {
            // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
            // the original object.
            func.apply(unwrap(this), args);
            return wrap_idb_value_wrap(cursorRequestMap.get(this));
        };
    }
    return function (...args) {
        // Calling the original function with the proxy as 'this' causes ILLEGAL INVOCATION, so we use
        // the original object.
        return wrap_idb_value_wrap(func.apply(unwrap(this), args));
    };
}
function transformCachableValue(value) {
    if (typeof value === 'function')
        return wrapFunction(value);
    // This doesn't return, it just creates a 'done' promise for the transaction,
    // which is later returned for transaction.done (see idbObjectHandler).
    if (value instanceof IDBTransaction)
        cacheDonePromiseForTransaction(value);
    if (instanceOfAny(value, getIdbProxyableTypes()))
        return new Proxy(value, idbProxyTraps);
    // Return the same value back if we're not going to transform it.
    return value;
}
function wrap_idb_value_wrap(value) {
    // We sometimes generate multiple promises from a single IDBRequest (eg when cursoring), because
    // IDB is weird and a single IDBRequest can yield many responses, so these can't be cached.
    if (value instanceof IDBRequest)
        return promisifyRequest(value);
    // If we've already transformed this value before, reuse the transformed value.
    // This is faster, but it also provides object equality.
    if (transformCache.has(value))
        return transformCache.get(value);
    const newValue = transformCachableValue(value);
    // Not all types are transformed.
    // These may be primitive types, so they can't be WeakMap keys.
    if (newValue !== value) {
        transformCache.set(value, newValue);
        reverseTransformCache.set(newValue, value);
    }
    return newValue;
}
const unwrap = (value) => reverseTransformCache.get(value);



;// ./node_modules/idb/build/index.js



/**
 * Open a database.
 *
 * @param name Name of the database.
 * @param version Schema version.
 * @param callbacks Additional callbacks.
 */
function openDB(name, version, { blocked, upgrade, blocking, terminated } = {}) {
    const request = indexedDB.open(name, version);
    const openPromise = wrap_idb_value_wrap(request);
    if (upgrade) {
        request.addEventListener('upgradeneeded', (event) => {
            upgrade(wrap_idb_value_wrap(request.result), event.oldVersion, event.newVersion, wrap_idb_value_wrap(request.transaction), event);
        });
    }
    if (blocked) {
        request.addEventListener('blocked', (event) => blocked(
        // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
        event.oldVersion, event.newVersion, event));
    }
    openPromise
        .then((db) => {
        if (terminated)
            db.addEventListener('close', () => terminated());
        if (blocking) {
            db.addEventListener('versionchange', (event) => blocking(event.oldVersion, event.newVersion, event));
        }
    })
        .catch(() => { });
    return openPromise;
}
/**
 * Delete a database.
 *
 * @param name Name of the database.
 */
function deleteDB(name, { blocked } = {}) {
    const request = indexedDB.deleteDatabase(name);
    if (blocked) {
        request.addEventListener('blocked', (event) => blocked(
        // Casting due to https://github.com/microsoft/TypeScript-DOM-lib-generator/pull/1405
        event.oldVersion, event));
    }
    return wrap(request).then(() => undefined);
}

const readMethods = ['get', 'getKey', 'getAll', 'getAllKeys', 'count'];
const writeMethods = ['put', 'add', 'delete', 'clear'];
const cachedMethods = new Map();
function getMethod(target, prop) {
    if (!(target instanceof IDBDatabase &&
        !(prop in target) &&
        typeof prop === 'string')) {
        return;
    }
    if (cachedMethods.get(prop))
        return cachedMethods.get(prop);
    const targetFuncName = prop.replace(/FromIndex$/, '');
    const useIndex = prop !== targetFuncName;
    const isWrite = writeMethods.includes(targetFuncName);
    if (
    // Bail if the target doesn't exist on the target. Eg, getAll isn't in Edge.
    !(targetFuncName in (useIndex ? IDBIndex : IDBObjectStore).prototype) ||
        !(isWrite || readMethods.includes(targetFuncName))) {
        return;
    }
    const method = async function (storeName, ...args) {
        // isWrite ? 'readwrite' : undefined gzipps better, but fails in Edge :(
        const tx = this.transaction(storeName, isWrite ? 'readwrite' : 'readonly');
        let target = tx.store;
        if (useIndex)
            target = target.index(args.shift());
        // Must reject if op rejects.
        // If it's a write operation, must reject if tx.done rejects.
        // Must reject with op rejection first.
        // Must resolve with op value.
        // Must handle both promises (no unhandled rejections)
        return (await Promise.all([
            target[targetFuncName](...args),
            isWrite && tx.done,
        ]))[0];
    };
    cachedMethods.set(prop, method);
    return method;
}
replaceTraps((oldTraps) => ({
    ...oldTraps,
    get: (target, prop, receiver) => getMethod(target, prop) || oldTraps.get(target, prop, receiver),
    has: (target, prop) => !!getMethod(target, prop) || oldTraps.has(target, prop),
}));



;// ./src/db/favorite-db.js
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _slicedToArray(r, e) { return _arrayWithHoles(r) || _iterableToArrayLimit(r, e) || _unsupportedIterableToArray(r, e) || _nonIterableRest(); }
function _nonIterableRest() { throw new TypeError("Invalid attempt to destructure non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _iterableToArrayLimit(r, l) { var t = null == r ? null : "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (null != t) { var e, n, i, u, a = [], f = !0, o = !1; try { if (i = (t = t.call(r)).next, 0 === l) { if (Object(t) !== t) return; f = !1; } else for (; !(f = (e = i.call(t)).done) && (a.push(e.value), a.length !== l); f = !0); } catch (r) { o = !0, n = r; } finally { try { if (!f && null != t["return"] && (u = t["return"](), Object(u) !== u)) return; } finally { if (o) throw n; } } return a; } }
function _arrayWithHoles(r) { if (Array.isArray(r)) return r; }
function _createForOfIteratorHelper(r, e) { var t = "undefined" != typeof Symbol && r[Symbol.iterator] || r["@@iterator"]; if (!t) { if (Array.isArray(r) || (t = _unsupportedIterableToArray(r)) || e && r && "number" == typeof r.length) { t && (r = t); var _n = 0, F = function F() {}; return { s: F, n: function n() { return _n >= r.length ? { done: !0 } : { done: !1, value: r[_n++] }; }, e: function e(r) { throw r; }, f: F }; } throw new TypeError("Invalid attempt to iterate non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); } var o, a = !0, u = !1; return { s: function s() { t = t.call(r); }, n: function n() { var r = t.next(); return a = r.done, r; }, e: function e(r) { u = !0, o = r; }, f: function f() { try { a || null == t["return"] || t["return"](); } finally { if (u) throw o; } } }; }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }

var DB_NAME = "story-db";
var STORE_FAVORITES = "favorites";
var STORE_OFFLINE_STORIES = "offline-stories";
var favoriteDB = {
  init: function init() {
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
      return _regenerator().w(function (_context) {
        while (1) switch (_context.n) {
          case 0:
            return _context.a(2, openDB(DB_NAME, 2, {
              upgrade: function upgrade(db, oldVersion) {
                if (!db.objectStoreNames.contains(STORE_FAVORITES)) {
                  db.createObjectStore(STORE_FAVORITES, {
                    keyPath: "id"
                  });
                }
                if (!db.objectStoreNames.contains(STORE_OFFLINE_STORIES)) {
                  db.createObjectStore(STORE_OFFLINE_STORIES, {
                    keyPath: "id",
                    autoIncrement: true
                  });
                }
              }
            }));
        }
      }, _callee);
    }))();
  },
  // Favorites CRUD
  addFavorite: function addFavorite(story) {
    var _this = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee2() {
      var db;
      return _regenerator().w(function (_context2) {
        while (1) switch (_context2.n) {
          case 0:
            _context2.n = 1;
            return _this.init();
          case 1:
            db = _context2.v;
            _context2.n = 2;
            return db.put(STORE_FAVORITES, story);
          case 2:
            console.log("📦 Story disimpan ke favorites:", story.name);
          case 3:
            return _context2.a(2);
        }
      }, _callee2);
    }))();
  },
  getAllFavorites: function getAllFavorites() {
    var _this2 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee3() {
      var db;
      return _regenerator().w(function (_context3) {
        while (1) switch (_context3.n) {
          case 0:
            _context3.n = 1;
            return _this2.init();
          case 1:
            db = _context3.v;
            return _context3.a(2, db.getAll(STORE_FAVORITES));
        }
      }, _callee3);
    }))();
  },
  deleteFavorite: function deleteFavorite(id) {
    var _this3 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee4() {
      var db;
      return _regenerator().w(function (_context4) {
        while (1) switch (_context4.n) {
          case 0:
            _context4.n = 1;
            return _this3.init();
          case 1:
            db = _context4.v;
            _context4.n = 2;
            return db["delete"](STORE_FAVORITES, id);
          case 2:
            console.log("🗑️ Story dihapus dari favorites:", id);
          case 3:
            return _context4.a(2);
        }
      }, _callee4);
    }))();
  },
  // Search/Filter/Sort for favorites
  searchFavorites: function searchFavorites(query) {
    var _this4 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee5() {
      var favorites;
      return _regenerator().w(function (_context5) {
        while (1) switch (_context5.n) {
          case 0:
            _context5.n = 1;
            return _this4.getAllFavorites();
          case 1:
            favorites = _context5.v;
            return _context5.a(2, favorites.filter(function (story) {
              return story.name.toLowerCase().includes(query.toLowerCase()) || story.description.toLowerCase().includes(query.toLowerCase());
            }));
        }
      }, _callee5);
    }))();
  },
  filterFavoritesByDate: function filterFavoritesByDate() {
    var _arguments = arguments,
      _this5 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee6() {
      var order, favorites;
      return _regenerator().w(function (_context6) {
        while (1) switch (_context6.n) {
          case 0:
            order = _arguments.length > 0 && _arguments[0] !== undefined ? _arguments[0] : 'desc';
            _context6.n = 1;
            return _this5.getAllFavorites();
          case 1:
            favorites = _context6.v;
            return _context6.a(2, favorites.sort(function (a, b) {
              var dateA = new Date(a.createdAt);
              var dateB = new Date(b.createdAt);
              return order === 'desc' ? dateB - dateA : dateA - dateB;
            }));
        }
      }, _callee6);
    }))();
  },
  sortFavoritesByName: function sortFavoritesByName() {
    var _arguments2 = arguments,
      _this6 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee7() {
      var order, favorites;
      return _regenerator().w(function (_context7) {
        while (1) switch (_context7.n) {
          case 0:
            order = _arguments2.length > 0 && _arguments2[0] !== undefined ? _arguments2[0] : 'asc';
            _context7.n = 1;
            return _this6.getAllFavorites();
          case 1:
            favorites = _context7.v;
            return _context7.a(2, favorites.sort(function (a, b) {
              var nameA = a.name.toLowerCase();
              var nameB = b.name.toLowerCase();
              if (order === 'asc') {
                return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
              } else {
                return nameA > nameB ? -1 : nameA < nameB ? 1 : 0;
              }
            }));
        }
      }, _callee7);
    }))();
  },
  // Offline Stories Queue
  addOfflineStory: function addOfflineStory(formData) {
    var _this7 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee8() {
      var db, storyData, id, _t, _t2;
      return _regenerator().w(function (_context8) {
        while (1) switch (_context8.n) {
          case 0:
            _context8.n = 1;
            return _this7.init();
          case 1:
            db = _context8.v;
            _context8.n = 2;
            return _this7.formDataToObject(formData);
          case 2:
            _t = _context8.v;
            _t2 = Date.now();
            storyData = {
              formData: _t,
              timestamp: _t2,
              synced: false
            };
            _context8.n = 3;
            return db.add(STORE_OFFLINE_STORIES, storyData);
          case 3:
            id = _context8.v;
            console.log("📱 Story offline disimpan:", id);
            return _context8.a(2, id);
        }
      }, _callee8);
    }))();
  },
  getOfflineStories: function getOfflineStories() {
    var _this8 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee9() {
      var db;
      return _regenerator().w(function (_context9) {
        while (1) switch (_context9.n) {
          case 0:
            _context9.n = 1;
            return _this8.init();
          case 1:
            db = _context9.v;
            return _context9.a(2, db.getAll(STORE_OFFLINE_STORIES));
        }
      }, _callee9);
    }))();
  },
  deleteOfflineStory: function deleteOfflineStory(id) {
    var _this9 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee0() {
      var db;
      return _regenerator().w(function (_context0) {
        while (1) switch (_context0.n) {
          case 0:
            _context0.n = 1;
            return _this9.init();
          case 1:
            db = _context0.v;
            _context0.n = 2;
            return db["delete"](STORE_OFFLINE_STORIES, id);
          case 2:
            console.log("🗑️ Offline story dihapus:", id);
          case 3:
            return _context0.a(2);
        }
      }, _callee0);
    }))();
  },
  markSynced: function markSynced(id) {
    var _this0 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee1() {
      var db, story;
      return _regenerator().w(function (_context1) {
        while (1) switch (_context1.n) {
          case 0:
            _context1.n = 1;
            return _this0.init();
          case 1:
            db = _context1.v;
            _context1.n = 2;
            return db.get(STORE_OFFLINE_STORIES, id);
          case 2:
            story = _context1.v;
            if (!story) {
              _context1.n = 4;
              break;
            }
            story.synced = true;
            _context1.n = 3;
            return db.put(STORE_OFFLINE_STORIES, story);
          case 3:
            console.log("✅ Offline story marked as synced:", id);
          case 4:
            return _context1.a(2);
        }
      }, _callee1);
    }))();
  },
  // Sync offline stories when online
  syncOfflineStories: function syncOfflineStories(apiModel) {
    var _this1 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee10() {
      var offlineStories, unsynced, _iterator, _step, story, formData, result, _t3, _t4;
      return _regenerator().w(function (_context10) {
        while (1) switch (_context10.p = _context10.n) {
          case 0:
            _context10.n = 1;
            return _this1.getOfflineStories();
          case 1:
            offlineStories = _context10.v;
            unsynced = offlineStories.filter(function (story) {
              return !story.synced;
            });
            _iterator = _createForOfIteratorHelper(unsynced);
            _context10.p = 2;
            _iterator.s();
          case 3:
            if ((_step = _iterator.n()).done) {
              _context10.n = 10;
              break;
            }
            story = _step.value;
            _context10.p = 4;
            formData = _this1.objectToFormData(story.formData);
            _context10.n = 5;
            return apiModel.addStory(formData);
          case 5:
            result = _context10.v;
            if (result.error) {
              _context10.n = 7;
              break;
            }
            _context10.n = 6;
            return _this1.markSynced(story.id);
          case 6:
            console.log("✅ Offline story synced:", story.id);
          case 7:
            _context10.n = 9;
            break;
          case 8:
            _context10.p = 8;
            _t3 = _context10.v;
            console.error("❌ Failed to sync offline story:", story.id, _t3);
          case 9:
            _context10.n = 3;
            break;
          case 10:
            _context10.n = 12;
            break;
          case 11:
            _context10.p = 11;
            _t4 = _context10.v;
            _iterator.e(_t4);
          case 12:
            _context10.p = 12;
            _iterator.f();
            return _context10.f(12);
          case 13:
            return _context10.a(2);
        }
      }, _callee10, null, [[4, 8], [2, 11, 12, 13]]);
    }))();
  },
  // Utility functions
  formDataToObject: function formDataToObject(formData) {
    var _this10 = this;
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee11() {
      var obj, _iterator2, _step2, _step2$value, key, value, _t5, _t6, _t7, _t8, _t9;
      return _regenerator().w(function (_context11) {
        while (1) switch (_context11.p = _context11.n) {
          case 0:
            obj = {};
            _iterator2 = _createForOfIteratorHelper(formData.entries());
            _context11.p = 1;
            _iterator2.s();
          case 2:
            if ((_step2 = _iterator2.n()).done) {
              _context11.n = 6;
              break;
            }
            _step2$value = _slicedToArray(_step2.value, 2), key = _step2$value[0], value = _step2$value[1];
            if (!(value instanceof File)) {
              _context11.n = 4;
              break;
            }
            _t5 = value.name;
            _t6 = value.type;
            _t7 = value.size;
            _context11.n = 3;
            return _this10.fileToBase64(value);
          case 3:
            _t8 = _context11.v;
            obj[key] = {
              name: _t5,
              type: _t6,
              size: _t7,
              data: _t8
            };
            _context11.n = 5;
            break;
          case 4:
            obj[key] = value;
          case 5:
            _context11.n = 2;
            break;
          case 6:
            _context11.n = 8;
            break;
          case 7:
            _context11.p = 7;
            _t9 = _context11.v;
            _iterator2.e(_t9);
          case 8:
            _context11.p = 8;
            _iterator2.f();
            return _context11.f(8);
          case 9:
            return _context11.a(2, obj);
        }
      }, _callee11, null, [[1, 7, 8, 9]]);
    }))();
  },
  objectToFormData: function objectToFormData(obj) {
    var formData = new FormData();
    for (var _i = 0, _Object$entries = Object.entries(obj); _i < _Object$entries.length; _i++) {
      var _Object$entries$_i = _slicedToArray(_Object$entries[_i], 2),
        key = _Object$entries$_i[0],
        value = _Object$entries$_i[1];
      if (value && _typeof(value) === 'object' && value.data) {
        // Convert base64 back to file
        var file = this.base64ToFile(value.data, value.name, value.type);
        formData.append(key, file);
      } else {
        formData.append(key, value);
      }
    }
    return formData;
  },
  fileToBase64: function fileToBase64(file) {
    return _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee12() {
      return _regenerator().w(function (_context12) {
        while (1) switch (_context12.n) {
          case 0:
            return _context12.a(2, new Promise(function (resolve, reject) {
              var reader = new FileReader();
              reader.onload = function () {
                return resolve(reader.result);
              };
              reader.onerror = reject;
              reader.readAsDataURL(file);
            }));
        }
      }, _callee12);
    }))();
  },
  base64ToFile: function base64ToFile(base64, filename, mimeType) {
    var arr = base64.split(',');
    var bstr = atob(arr[1]);
    var n = bstr.length;
    var u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new File([u8arr], filename, {
      type: mimeType
    });
  }
};

/***/ })

/******/ 	});
/************************************************************************/
/******/ 	// The module cache
/******/ 	var __webpack_module_cache__ = {};
/******/ 	
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/ 		// Check if module is in cache
/******/ 		var cachedModule = __webpack_module_cache__[moduleId];
/******/ 		if (cachedModule !== undefined) {
/******/ 			return cachedModule.exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = __webpack_module_cache__[moduleId] = {
/******/ 			// no module.id needed
/******/ 			// no module.loaded needed
/******/ 			exports: {}
/******/ 		};
/******/ 	
/******/ 		// Execute the module function
/******/ 		__webpack_modules__[moduleId](module, module.exports, __webpack_require__);
/******/ 	
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/ 	
/************************************************************************/
/******/ 	/* webpack/runtime/define property getters */
/******/ 	(() => {
/******/ 		// define getter functions for harmony exports
/******/ 		__webpack_require__.d = (exports, definition) => {
/******/ 			for(var key in definition) {
/******/ 				if(__webpack_require__.o(definition, key) && !__webpack_require__.o(exports, key)) {
/******/ 					Object.defineProperty(exports, key, { enumerable: true, get: definition[key] });
/******/ 				}
/******/ 			}
/******/ 		};
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/hasOwnProperty shorthand */
/******/ 	(() => {
/******/ 		__webpack_require__.o = (obj, prop) => (Object.prototype.hasOwnProperty.call(obj, prop))
/******/ 	})();
/******/ 	
/******/ 	/* webpack/runtime/make namespace object */
/******/ 	(() => {
/******/ 		// define __esModule on exports
/******/ 		__webpack_require__.r = (exports) => {
/******/ 			if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 				Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 			}
/******/ 			Object.defineProperty(exports, '__esModule', { value: true });
/******/ 		};
/******/ 	})();
/******/ 	
/************************************************************************/
var __webpack_exports__ = {};

;// ./src/presenters/pagePresenter.js
function _typeof(o) { "@babel/helpers - typeof"; return _typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, _typeof(o); }
function _regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return _regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, _regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, _regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), _regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", _regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), _regeneratorDefine2(u), _regeneratorDefine2(u, o, "Generator"), _regeneratorDefine2(u, n, function () { return this; }), _regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function _regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } _regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { _regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, _regeneratorDefine2(e, r, n, t); }
function asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function _asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function _classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function _defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, _toPropertyKey(o.key), o); } }
function _createClass(e, r, t) { return r && _defineProperties(e.prototype, r), t && _defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == _typeof(i) ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != _typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != _typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }
var PagePresenter = /*#__PURE__*/function () {
  function PagePresenter(view) {
    _classCallCheck(this, PagePresenter);
    this.view = view;
  }
  return _createClass(PagePresenter, [{
    key: "getView",
    value: function () {
      var _getView = _asyncToGenerator(/*#__PURE__*/_regenerator().m(function _callee() {
        var _this = this;
        var viewElement;
        return _regenerator().w(function (_context) {
          while (1) switch (_context.n) {
            case 0:
              _context.n = 1;
              return this.view.render();
            case 1:
              viewElement = _context.v;
              // Jalankan afterRender() setelah elemen sudah ada di DOM
              // (router akan appendChild-nya lebih dulu)
              setTimeout(function () {
                if (typeof _this.view.afterRender === "function") {
                  _this.view.afterRender();
                }
              }, 0);
              return _context.a(2, viewElement);
          }
        }, _callee, this);
      }));
      function getView() {
        return _getView.apply(this, arguments);
      }
      return getView;
    }()
  }]);
}();
;// ./src/models/dataModel.js
var dataModel = {
  appName: "Story Map App",
  about: "Aplikasi ini dapat menandakan sebuah lokasi untuk meelakukan share foto mirip seperti membuat story.",
  contact: "Follow IG @kareem_bw"
};
;// ./src/models/apiModel.js
function apiModel_regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return apiModel_regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (apiModel_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, apiModel_regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, apiModel_regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), apiModel_regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", apiModel_regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), apiModel_regeneratorDefine2(u), apiModel_regeneratorDefine2(u, o, "Generator"), apiModel_regeneratorDefine2(u, n, function () { return this; }), apiModel_regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (apiModel_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function apiModel_regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } apiModel_regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { apiModel_regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, apiModel_regeneratorDefine2(e, r, n, t); }
function apiModel_asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function apiModel_asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { apiModel_asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { apiModel_asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
// apiModel.js
var BASE_URL = "https://story-api.dicoding.dev/v1";
var apiModel = {
  // ===============================
  // 🔐 Autentikasi
  // ===============================
  register: function register(name, email, password) {
    return apiModel_asyncToGenerator(/*#__PURE__*/apiModel_regenerator().m(function _callee() {
      var response, data, _t;
      return apiModel_regenerator().w(function (_context) {
        while (1) switch (_context.p = _context.n) {
          case 0:
            _context.p = 0;
            _context.n = 1;
            return fetch("".concat(BASE_URL, "/register"), {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                name: name,
                email: email,
                password: password
              })
            });
          case 1:
            response = _context.v;
            _context.n = 2;
            return response.json();
          case 2:
            data = _context.v;
            if (!data.error) {
              _context.n = 3;
              break;
            }
            throw new Error(data.message);
          case 3:
            return _context.a(2, {
              success: true,
              message: "Registrasi berhasil! Silakan login."
            });
          case 4:
            _context.p = 4;
            _t = _context.v;
            console.error("❌ Register gagal:", _t.message);
            return _context.a(2, {
              success: false,
              message: _t.message
            });
        }
      }, _callee, null, [[0, 4]]);
    }))();
  },
  login: function login(email, password) {
    return apiModel_asyncToGenerator(/*#__PURE__*/apiModel_regenerator().m(function _callee2() {
      var response, data, token, _t2;
      return apiModel_regenerator().w(function (_context2) {
        while (1) switch (_context2.p = _context2.n) {
          case 0:
            _context2.p = 0;
            _context2.n = 1;
            return fetch("".concat(BASE_URL, "/login"), {
              method: "POST",
              headers: {
                "Content-Type": "application/json"
              },
              body: JSON.stringify({
                email: email,
                password: password
              })
            });
          case 1:
            response = _context2.v;
            _context2.n = 2;
            return response.json();
          case 2:
            data = _context2.v;
            if (!data.error) {
              _context2.n = 3;
              break;
            }
            throw new Error(data.message);
          case 3:
            token = data.loginResult.token;
            localStorage.setItem("token", token);
            localStorage.setItem("userName", data.loginResult.name);
            console.log("✅ Login berhasil, token disimpan di localStorage");
            return _context2.a(2, {
              success: true,
              message: "Login berhasil!"
            });
          case 4:
            _context2.p = 4;
            _t2 = _context2.v;
            console.error("❌ Login gagal:", _t2.message);
            return _context2.a(2, {
              success: false,
              message: _t2.message
            });
        }
      }, _callee2, null, [[0, 4]]);
    }))();
  },
  logout: function logout() {
    localStorage.removeItem("token");
    localStorage.removeItem("userName");
    console.log("🚪 Logout berhasil, token dihapus.");
  },
  getToken: function getToken() {
    return localStorage.getItem("token");
  },
  isLoggedIn: function isLoggedIn() {
    return !!localStorage.getItem("token");
  },
  // ===============================
  // 📜 Data Story
  // ===============================
  getStories: function getStories() {
    var _this = this;
    return apiModel_asyncToGenerator(/*#__PURE__*/apiModel_regenerator().m(function _callee3() {
      var token, cachedStories, response, result, _cachedStories, _t3;
      return apiModel_regenerator().w(function (_context3) {
        while (1) switch (_context3.p = _context3.n) {
          case 0:
            token = _this.getToken();
            if (token) {
              _context3.n = 1;
              break;
            }
            console.warn("⚠️ Tidak ada token, silakan login dulu.");
            return _context3.a(2, []);
          case 1:
            if (navigator.onLine) {
              _context3.n = 3;
              break;
            }
            cachedStories = localStorage.getItem('cachedStories');
            if (!cachedStories) {
              _context3.n = 2;
              break;
            }
            console.log("📦 Using cached stories from localStorage (offline mode)");
            return _context3.a(2, JSON.parse(cachedStories));
          case 2:
            console.warn("⚠️ No cached stories available offline");
            return _context3.a(2, []);
          case 3:
            _context3.p = 3;
            _context3.n = 4;
            return fetch("".concat(BASE_URL, "/stories"), {
              headers: {
                Authorization: "Bearer ".concat(token)
              }
            });
          case 4:
            response = _context3.v;
            _context3.n = 5;
            return response.json();
          case 5:
            result = _context3.v;
            if (!result.error) {
              _context3.n = 6;
              break;
            }
            throw new Error(result.message);
          case 6:
            // Cache the stories in localStorage for offline use
            localStorage.setItem('cachedStories', JSON.stringify(result.listStory));
            console.log("\uD83D\uDCE6 ".concat(result.listStory.length, " story berhasil diambil dan di-cache."));
            return _context3.a(2, result.listStory);
          case 7:
            _context3.p = 7;
            _t3 = _context3.v;
            console.error("❌ Gagal memuat story:", _t3.message);
            // Fallback to localStorage cache
            _cachedStories = localStorage.getItem('cachedStories');
            if (!_cachedStories) {
              _context3.n = 8;
              break;
            }
            console.log("📦 Using cached stories from localStorage");
            return _context3.a(2, JSON.parse(_cachedStories));
          case 8:
            return _context3.a(2, []);
        }
      }, _callee3, null, [[3, 7]]);
    }))();
  },
  addStory: function addStory(formData) {
    var _this2 = this;
    return apiModel_asyncToGenerator(/*#__PURE__*/apiModel_regenerator().m(function _callee4() {
      var token, response, result, _t4;
      return apiModel_regenerator().w(function (_context4) {
        while (1) switch (_context4.p = _context4.n) {
          case 0:
            token = _this2.getToken();
            if (token) {
              _context4.n = 1;
              break;
            }
            return _context4.a(2, {
              error: true,
              message: "Silakan login terlebih dahulu."
            });
          case 1:
            _context4.p = 1;
            _context4.n = 2;
            return fetch("".concat(BASE_URL, "/stories"), {
              method: "POST",
              headers: {
                Authorization: "Bearer ".concat(token)
              },
              body: formData
            });
          case 2:
            response = _context4.v;
            _context4.n = 3;
            return response.json();
          case 3:
            result = _context4.v;
            if (!result.error) {
              _context4.n = 4;
              break;
            }
            throw new Error(result.message);
          case 4:
            console.log("✅ Story berhasil ditambahkan!");
            return _context4.a(2, {
              error: false,
              message: "Story berhasil dikirim!"
            });
          case 5:
            _context4.p = 5;
            _t4 = _context4.v;
            console.error("❌ Gagal mengirim story:", _t4.message);
            return _context4.a(2, {
              error: true,
              message: _t4.message
            });
        }
      }, _callee4, null, [[1, 5]]);
    }))();
  },
  // ===============================
  // 🔔 Web Push Notification
  // ===============================
  subscribeWebPush: function subscribeWebPush(subscription) {
    var _this3 = this;
    return apiModel_asyncToGenerator(/*#__PURE__*/apiModel_regenerator().m(function _callee5() {
      var token, body, response, result, _t5;
      return apiModel_regenerator().w(function (_context5) {
        while (1) switch (_context5.p = _context5.n) {
          case 0:
            token = _this3.getToken();
            if (token) {
              _context5.n = 1;
              break;
            }
            return _context5.a(2, {
              error: true,
              message: "Silakan login terlebih dahulu."
            });
          case 1:
            _context5.p = 1;
            // Format sesuai dokumentasi
            body = {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.keys.p256dh,
                auth: subscription.keys.auth
              }
            };
            _context5.n = 2;
            return fetch("".concat(BASE_URL, "/notifications/subscribe"), {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer ".concat(token)
              },
              body: JSON.stringify(body)
            });
          case 2:
            response = _context5.v;
            _context5.n = 3;
            return response.json();
          case 3:
            result = _context5.v;
            if (!result.error) {
              _context5.n = 4;
              break;
            }
            throw new Error(result.message);
          case 4:
            console.log("✅ WebPush subscription berhasil:", result);
            return _context5.a(2, {
              error: false,
              message: result.message,
              data: result.data
            });
          case 5:
            _context5.p = 5;
            _t5 = _context5.v;
            console.error("❌ Failed to subscribe WebPush:", _t5.message);
            return _context5.a(2, {
              error: true,
              message: _t5.message
            });
        }
      }, _callee5, null, [[1, 5]]);
    }))();
  },
  unsubscribeWebPush: function unsubscribeWebPush(subscription) {
    var _this4 = this;
    return apiModel_asyncToGenerator(/*#__PURE__*/apiModel_regenerator().m(function _callee6() {
      var token, body, response, result, _t6;
      return apiModel_regenerator().w(function (_context6) {
        while (1) switch (_context6.p = _context6.n) {
          case 0:
            token = _this4.getToken();
            if (token) {
              _context6.n = 1;
              break;
            }
            return _context6.a(2, {
              error: true,
              message: "Silakan login terlebih dahulu."
            });
          case 1:
            _context6.p = 1;
            // Hanya kirim endpoint sesuai dokumentasi
            body = {
              endpoint: subscription.endpoint
            };
            _context6.n = 2;
            return fetch("".concat(BASE_URL, "/notifications/subscribe"), {
              method: "DELETE",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer ".concat(token)
              },
              body: JSON.stringify(body)
            });
          case 2:
            response = _context6.v;
            _context6.n = 3;
            return response.json();
          case 3:
            result = _context6.v;
            if (!result.error) {
              _context6.n = 4;
              break;
            }
            throw new Error(result.message);
          case 4:
            console.log("✅ WebPush unsubscription berhasil:", result);
            return _context6.a(2, {
              error: false,
              message: result.message
            });
          case 5:
            _context6.p = 5;
            _t6 = _context6.v;
            console.error("❌ Failed to unsubscribe WebPush:", _t6.message);
            return _context6.a(2, {
              error: true,
              message: _t6.message
            });
        }
      }, _callee6, null, [[1, 5]]);
    }))();
  }
};
// EXTERNAL MODULE: ./src/db/favorite-db.js + 2 modules
var favorite_db = __webpack_require__(460);
;// ./scripts/pwa-init.js
function pwa_init_regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return pwa_init_regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (pwa_init_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, pwa_init_regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, pwa_init_regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), pwa_init_regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", pwa_init_regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), pwa_init_regeneratorDefine2(u), pwa_init_regeneratorDefine2(u, o, "Generator"), pwa_init_regeneratorDefine2(u, n, function () { return this; }), pwa_init_regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (pwa_init_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function pwa_init_regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } pwa_init_regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { pwa_init_regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, pwa_init_regeneratorDefine2(e, r, n, t); }
function pwa_init_asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function pwa_init_asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { pwa_init_asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { pwa_init_asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }



// Daftarkan Service Worker
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(function () {
    return console.log("✅ Service Worker terdaftar");
  })["catch"](function (err) {
    return console.error("❌ SW gagal:", err);
  });
}

// Simpan event install prompt
var deferredPrompt;
window.addEventListener("beforeinstallprompt", function (e) {
  e.preventDefault();
  deferredPrompt = e;
  var installBtn = document.createElement("button");
  installBtn.textContent = "📱 Install Aplikasi";
  installBtn.classList.add("install-btn");
  document.body.appendChild(installBtn);
  installBtn.addEventListener("click", /*#__PURE__*/pwa_init_asyncToGenerator(/*#__PURE__*/pwa_init_regenerator().m(function _callee() {
    var _yield$deferredPrompt, outcome;
    return pwa_init_regenerator().w(function (_context) {
      while (1) switch (_context.n) {
        case 0:
          installBtn.style.display = "none";
          deferredPrompt.prompt();
          _context.n = 1;
          return deferredPrompt.userChoice;
        case 1:
          _yield$deferredPrompt = _context.v;
          outcome = _yield$deferredPrompt.outcome;
          console.log("User choice: ".concat(outcome));
          deferredPrompt = null;
        case 2:
          return _context.a(2);
      }
    }, _callee);
  })));
});

// Online sync handler for offline stories
window.addEventListener('online', /*#__PURE__*/pwa_init_asyncToGenerator(/*#__PURE__*/pwa_init_regenerator().m(function _callee2() {
  return pwa_init_regenerator().w(function (_context2) {
    while (1) switch (_context2.n) {
      case 0:
        if (!apiModel.isLoggedIn()) {
          _context2.n = 1;
          break;
        }
        _context2.n = 1;
        return favorite_db.favoriteDB.syncOfflineStories(apiModel);
      case 1:
        return _context2.a(2);
    }
  }, _callee2);
})));

// Push Notification Subscription Management
var VAPID_PUBLIC_KEY = "BCCs2eonMI-6H2ctvFaWg-UYdDv387Vno_bzUzALpB442r2lCnsHmtrx8biyPi_E-1fSGABK_Qs_GlvPoJJqxbk";
var pushManager = {
  subscribe: function subscribe() {
    var _this = this;
    return pwa_init_asyncToGenerator(/*#__PURE__*/pwa_init_regenerator().m(function _callee3() {
      var registration, subscription, result, _t;
      return pwa_init_regenerator().w(function (_context3) {
        while (1) switch (_context3.p = _context3.n) {
          case 0:
            if (!(!("serviceWorker" in navigator) || !("PushManager" in window))) {
              _context3.n = 1;
              break;
            }
            console.warn("Push notifications not supported");
            return _context3.a(2, false);
          case 1:
            _context3.p = 1;
            _context3.n = 2;
            return navigator.serviceWorker.ready;
          case 2:
            registration = _context3.v;
            _context3.n = 3;
            return registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: _this.urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
            });
          case 3:
            subscription = _context3.v;
            _context3.n = 4;
            return apiModel.subscribeWebPush(subscription.toJSON());
          case 4:
            result = _context3.v;
            if (!result.error) {
              _context3.n = 6;
              break;
            }
            console.error("❌ Failed to register subscription on server");
            _context3.n = 5;
            return subscription.unsubscribe();
          case 5:
            return _context3.a(2, false);
          case 6:
            console.log("✅ Push subscription berhasil:", subscription);
            localStorage.setItem("pushSubscription", JSON.stringify(subscription));
            return _context3.a(2, true);
          case 7:
            _context3.p = 7;
            _t = _context3.v;
            console.error("❌ Push subscription gagal:", _t);
            return _context3.a(2, false);
        }
      }, _callee3, null, [[1, 7]]);
    }))();
  },
  unsubscribe: function unsubscribe() {
    return pwa_init_asyncToGenerator(/*#__PURE__*/pwa_init_regenerator().m(function _callee4() {
      var registration, subscription, result, _t2;
      return pwa_init_regenerator().w(function (_context4) {
        while (1) switch (_context4.p = _context4.n) {
          case 0:
            _context4.p = 0;
            _context4.n = 1;
            return navigator.serviceWorker.ready;
          case 1:
            registration = _context4.v;
            _context4.n = 2;
            return registration.pushManager.getSubscription();
          case 2:
            subscription = _context4.v;
            if (!subscription) {
              _context4.n = 5;
              break;
            }
            _context4.n = 3;
            return apiModel.unsubscribeWebPush(subscription.toJSON());
          case 3:
            result = _context4.v;
            if (result.error) {
              console.error("❌ Failed to unregister subscription on server");
              // Continue with local unsubscribe anyway
            }
            _context4.n = 4;
            return subscription.unsubscribe();
          case 4:
            console.log("✅ Push subscription dibatalkan");
            localStorage.removeItem("pushSubscription");
            return _context4.a(2, true);
          case 5:
            _context4.n = 7;
            break;
          case 6:
            _context4.p = 6;
            _t2 = _context4.v;
            console.error("❌ Unsubscribe gagal:", _t2);
          case 7:
            return _context4.a(2, false);
        }
      }, _callee4, null, [[0, 6]]);
    }))();
  },
  isSubscribed: function isSubscribed() {
    return pwa_init_asyncToGenerator(/*#__PURE__*/pwa_init_regenerator().m(function _callee5() {
      var registration, subscription, _t3;
      return pwa_init_regenerator().w(function (_context5) {
        while (1) switch (_context5.p = _context5.n) {
          case 0:
            _context5.p = 0;
            _context5.n = 1;
            return navigator.serviceWorker.ready;
          case 1:
            registration = _context5.v;
            _context5.n = 2;
            return registration.pushManager.getSubscription();
          case 2:
            subscription = _context5.v;
            return _context5.a(2, !!subscription);
          case 3:
            _context5.p = 3;
            _t3 = _context5.v;
            return _context5.a(2, false);
        }
      }, _callee5, null, [[0, 3]]);
    }))();
  },
  urlBase64ToUint8Array: function urlBase64ToUint8Array(base64String) {
    var padding = "=".repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);
    for (var i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }
};
;// ./src/views/homeView.js
function homeView_typeof(o) { "@babel/helpers - typeof"; return homeView_typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, homeView_typeof(o); }
function homeView_regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return homeView_regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (homeView_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, homeView_regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, homeView_regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), homeView_regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", homeView_regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), homeView_regeneratorDefine2(u), homeView_regeneratorDefine2(u, o, "Generator"), homeView_regeneratorDefine2(u, n, function () { return this; }), homeView_regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (homeView_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function homeView_regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } homeView_regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { homeView_regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, homeView_regeneratorDefine2(e, r, n, t); }
function homeView_asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function homeView_asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { homeView_asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { homeView_asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function homeView_classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function homeView_defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, homeView_toPropertyKey(o.key), o); } }
function homeView_createClass(e, r, t) { return r && homeView_defineProperties(e.prototype, r), t && homeView_defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function homeView_toPropertyKey(t) { var i = homeView_toPrimitive(t, "string"); return "symbol" == homeView_typeof(i) ? i : i + ""; }
function homeView_toPrimitive(t, r) { if ("object" != homeView_typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != homeView_typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }


var HomeView = /*#__PURE__*/function () {
  function HomeView() {
    homeView_classCallCheck(this, HomeView);
  }
  return homeView_createClass(HomeView, [{
    key: "render",
    value: function render() {
      var div = document.createElement("div");
      div.className = "page page-home";
      div.setAttribute("role", "region");
      div.setAttribute("aria-labelledby", "home-title");
      div.innerHTML = "\n            <h1 id=\"home-title\" class=\"page-title\" tabindex=\"0\">\n                Welcome to ".concat(dataModel.appName, "\n            </h1>\n            <p class=\"page-text\" aria-label=\"Deskripsi halaman home\">\n                Ini adalah halaman Home dengan transisi custom.\n            </p>\n            <div class=\"notification-settings\">\n                <button id=\"toggle-notifications\" class=\"btn-toggle-notifications\">\n                    Enable Push Notifications\n                </button>\n                <p id=\"notification-status\" class=\"notification-status\">Checking status...</p>\n            </div>\n        ");
      return div;
    }
  }, {
    key: "afterRender",
    value: function () {
      var _afterRender = homeView_asyncToGenerator(/*#__PURE__*/homeView_regenerator().m(function _callee2() {
        var _this = this;
        var toggleBtn, statusEl, isSubscribed;
        return homeView_regenerator().w(function (_context2) {
          while (1) switch (_context2.n) {
            case 0:
              toggleBtn = document.getElementById("toggle-notifications");
              statusEl = document.getElementById("notification-status");
              if (!(!("serviceWorker" in navigator) || !("PushManager" in window))) {
                _context2.n = 1;
                break;
              }
              statusEl.textContent = "Push notifications not supported in this browser.";
              toggleBtn.disabled = true;
              return _context2.a(2);
            case 1:
              if (!(location.protocol !== 'https:' && location.hostname !== 'localhost')) {
                _context2.n = 2;
                break;
              }
              statusEl.textContent = "Push notifications require HTTPS. Please access via secure connection.";
              toggleBtn.disabled = true;
              return _context2.a(2);
            case 2:
              _context2.n = 3;
              return pushManager.isSubscribed();
            case 3:
              isSubscribed = _context2.v;
              this.updateUI(isSubscribed, toggleBtn, statusEl);

              // Handle toggle
              toggleBtn.addEventListener("click", /*#__PURE__*/homeView_asyncToGenerator(/*#__PURE__*/homeView_regenerator().m(function _callee() {
                var success, newStatus, _t;
                return homeView_regenerator().w(function (_context) {
                  while (1) switch (_context.p = _context.n) {
                    case 0:
                      toggleBtn.disabled = true;
                      toggleBtn.textContent = "Processing...";
                      _context.p = 1;
                      if (!isSubscribed) {
                        _context.n = 3;
                        break;
                      }
                      _context.n = 2;
                      return pushManager.unsubscribe();
                    case 2:
                      success = _context.v;
                      _context.n = 5;
                      break;
                    case 3:
                      _context.n = 4;
                      return pushManager.subscribe();
                    case 4:
                      success = _context.v;
                    case 5:
                      _context.n = 7;
                      break;
                    case 6:
                      _context.p = 6;
                      _t = _context.v;
                      console.error("Push subscription error:", _t);
                      success = false;
                    case 7:
                      if (!success) {
                        _context.n = 9;
                        break;
                      }
                      _context.n = 8;
                      return pushManager.isSubscribed();
                    case 8:
                      newStatus = _context.v;
                      _this.updateUI(newStatus, toggleBtn, statusEl);
                      _context.n = 10;
                      break;
                    case 9:
                      alert("Failed to update notification settings. Please check console for errors.");
                      toggleBtn.disabled = false;
                      toggleBtn.textContent = isSubscribed ? "Disable Notifications" : "Enable Notifications";
                    case 10:
                      return _context.a(2);
                  }
                }, _callee, null, [[1, 6]]);
              })));
            case 4:
              return _context2.a(2);
          }
        }, _callee2, this);
      }));
      function afterRender() {
        return _afterRender.apply(this, arguments);
      }
      return afterRender;
    }()
  }, {
    key: "updateUI",
    value: function updateUI(isSubscribed, toggleBtn, statusEl) {
      if (isSubscribed) {
        toggleBtn.textContent = "Disable Push Notifications";
        statusEl.textContent = "Push notifications are enabled.";
      } else {
        toggleBtn.textContent = "Enable Push Notifications";
        statusEl.textContent = "Push notifications are disabled.";
      }
      toggleBtn.disabled = false;
    }
  }]);
}();

;// ./src/views/aboutView.js
function aboutView_typeof(o) { "@babel/helpers - typeof"; return aboutView_typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, aboutView_typeof(o); }
function aboutView_classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function aboutView_defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, aboutView_toPropertyKey(o.key), o); } }
function aboutView_createClass(e, r, t) { return r && aboutView_defineProperties(e.prototype, r), t && aboutView_defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function aboutView_toPropertyKey(t) { var i = aboutView_toPrimitive(t, "string"); return "symbol" == aboutView_typeof(i) ? i : i + ""; }
function aboutView_toPrimitive(t, r) { if ("object" != aboutView_typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != aboutView_typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }

var AboutView = /*#__PURE__*/function () {
  function AboutView() {
    aboutView_classCallCheck(this, AboutView);
  }
  return aboutView_createClass(AboutView, [{
    key: "render",
    value: function render() {
      var div = document.createElement("div");
      div.className = "page page-about";
      div.setAttribute("role", "region");
      div.setAttribute("aria-labelledby", "about-title");
      div.innerHTML = "\n      <h1 id=\"about-title\" class=\"page-title\" tabindex=\"0\">About</h1>\n      <p class=\"page-text\" tabindex=\"0\">".concat(dataModel.about, "</p>\n    ");
      return div;
    }
  }]);
}();

;// ./src/views/contactView.js
function contactView_typeof(o) { "@babel/helpers - typeof"; return contactView_typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, contactView_typeof(o); }
function contactView_classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function contactView_defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, contactView_toPropertyKey(o.key), o); } }
function contactView_createClass(e, r, t) { return r && contactView_defineProperties(e.prototype, r), t && contactView_defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function contactView_toPropertyKey(t) { var i = contactView_toPrimitive(t, "string"); return "symbol" == contactView_typeof(i) ? i : i + ""; }
function contactView_toPrimitive(t, r) { if ("object" != contactView_typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != contactView_typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }

var ContactView = /*#__PURE__*/function () {
  function ContactView() {
    contactView_classCallCheck(this, ContactView);
  }
  return contactView_createClass(ContactView, [{
    key: "render",
    value: function render() {
      var div = document.createElement("div");
      div.className = "page page-contact";
      div.setAttribute("role", "region");
      div.setAttribute("aria-labelledby", "contact-title");
      div.innerHTML = "\n            <h1 id=\"contact-title\" class=\"page-title\" tabindex=\"0\">Contact</h1>\n            <p class=\"page-text\" aria-label=\"Informasi kontak\">".concat(dataModel.contact, "</p>\n        ");
      return div;
    }
  }]);
}();

;// ./src/views/mapView.js
function mapView_typeof(o) { "@babel/helpers - typeof"; return mapView_typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, mapView_typeof(o); }
function mapView_regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return mapView_regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (mapView_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, mapView_regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, mapView_regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), mapView_regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", mapView_regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), mapView_regeneratorDefine2(u), mapView_regeneratorDefine2(u, o, "Generator"), mapView_regeneratorDefine2(u, n, function () { return this; }), mapView_regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (mapView_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function mapView_regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } mapView_regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { mapView_regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, mapView_regeneratorDefine2(e, r, n, t); }
function mapView_asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function mapView_asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { mapView_asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { mapView_asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function mapView_classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function mapView_defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, mapView_toPropertyKey(o.key), o); } }
function mapView_createClass(e, r, t) { return r && mapView_defineProperties(e.prototype, r), t && mapView_defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function mapView_toPropertyKey(t) { var i = mapView_toPrimitive(t, "string"); return "symbol" == mapView_typeof(i) ? i : i + ""; }
function mapView_toPrimitive(t, r) { if ("object" != mapView_typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != mapView_typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }


var MapView = /*#__PURE__*/function () {
  function MapView() {
    mapView_classCallCheck(this, MapView);
    this.map = null;
    this.markers = [];
    this.stories = [];
  }
  return mapView_createClass(MapView, [{
    key: "render",
    value: function () {
      var _render = mapView_asyncToGenerator(/*#__PURE__*/mapView_regenerator().m(function _callee() {
        var _this = this;
        var container;
        return mapView_regenerator().w(function (_context) {
          while (1) switch (_context.n) {
            case 0:
              container = document.createElement("div");
              container.className = "page page-map";
              container.setAttribute("role", "region");
              container.setAttribute("aria-labelledby", "map-title");
              container.innerHTML = "\n            <h1 id=\"map-title\" class=\"page-title\" tabindex=\"0\">Peta Cerita</h1>\n\n            <div class=\"map-wrapper\">\n                <div id=\"map\" class=\"map\" role=\"application\" aria-label=\"Peta lokasi cerita\"></div>\n                <div class=\"story-list\" role=\"list\" aria-label=\"Daftar cerita\"></div>\n            </div>\n        ";

              // Tunggu DOM ter-attach baru init map
              setTimeout(function () {
                return _this.initMap(container);
              }, 0);
              return _context.a(2, container);
          }
        }, _callee);
      }));
      function render() {
        return _render.apply(this, arguments);
      }
      return render;
    }()
  }, {
    key: "initMap",
    value: function () {
      var _initMap = mapView_asyncToGenerator(/*#__PURE__*/mapView_regenerator().m(function _callee3(container) {
        var _this2 = this;
        var mapEl, listEl, tile1, tile2;
        return mapView_regenerator().w(function (_context3) {
          while (1) switch (_context3.n) {
            case 0:
              mapEl = container.querySelector("#map");
              listEl = container.querySelector(".story-list"); // Cleanup existing map if any
              if (this.map) {
                this.map.remove();
                this.map = null;
                this.markers = [];
              }

              // Clear map container
              mapEl.innerHTML = '';
              _context3.n = 1;
              return apiModel.getStories();
            case 1:
              this.stories = _context3.v;
              // Inisialisasi Leaflet map
              this.map = L.map(mapEl).setView([-2.5, 118], 5);

              // Base layer
              tile1 = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                attribution: "© OpenStreetMap contributors"
              }).addTo(this.map);
              tile2 = L.tileLayer("https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png", {
                attribution: "© OpenTopoMap contributors"
              }); // Layer control
              L.control.layers({
                "Street Map": tile1,
                "Topo Map": tile2
              }).addTo(this.map);

              // PENTING: Panggil invalidateSize setelah map diinisialisasi
              // dan pastikan container sudah memiliki ukuran yang benar
              requestAnimationFrame(function () {
                _this2.map.invalidateSize();
              });

              // Render daftar story dengan tombol favorite
              _context3.n = 2;
              return this.renderStoryList(listEl);
            case 2:
              // Tambahkan marker ke peta
              this.stories.forEach(function (story, i) {
                if (story.lat && story.lon) {
                  var marker = L.marker([story.lat, story.lon]).addTo(_this2.map).bindPopup("<b>".concat(story.name, "</b><br>").concat(story.description));
                  _this2.markers.push(marker);
                }
              });

              // Interaksi antara daftar dan marker
              listEl.addEventListener("click", /*#__PURE__*/function () {
                var _ref = mapView_asyncToGenerator(/*#__PURE__*/mapView_regenerator().m(function _callee2(e) {
                  var item, favoriteBtn, index, story;
                  return mapView_regenerator().w(function (_context2) {
                    while (1) switch (_context2.n) {
                      case 0:
                        item = e.target.closest(".story-item");
                        favoriteBtn = e.target.closest(".btn-favorite");
                        if (!favoriteBtn) {
                          _context2.n = 3;
                          break;
                        }
                        e.stopPropagation();
                        _context2.n = 1;
                        return _this2.toggleFavorite(favoriteBtn.dataset.id);
                      case 1:
                        _context2.n = 2;
                        return _this2.renderStoryList(listEl);
                      case 2:
                        return _context2.a(2);
                      case 3:
                        if (item) {
                          _context2.n = 4;
                          break;
                        }
                        return _context2.a(2);
                      case 4:
                        index = item.dataset.index;
                        story = _this2.stories[index];
                        if (story.lat && story.lon) {
                          _this2.map.flyTo([story.lat, story.lon], 10);
                          _this2.markers[index].openPopup();
                        }
                        container.querySelectorAll(".story-item").forEach(function (el) {
                          return el.classList.remove("active");
                        });
                        item.classList.add("active");
                      case 5:
                        return _context2.a(2);
                    }
                  }, _callee2);
                }));
                return function (_x2) {
                  return _ref.apply(this, arguments);
                };
              }());

              // Aksesibilitas tambahan: navigasi keyboard
              listEl.addEventListener("keydown", function (e) {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  var item = e.target.closest(".story-item");
                  if (item) item.click();
                }
              });
            case 3:
              return _context3.a(2);
          }
        }, _callee3, this);
      }));
      function initMap(_x) {
        return _initMap.apply(this, arguments);
      }
      return initMap;
    }()
  }, {
    key: "renderStoryList",
    value: function () {
      var _renderStoryList = mapView_asyncToGenerator(/*#__PURE__*/mapView_regenerator().m(function _callee4(listEl) {
        var favorites, favoriteIds;
        return mapView_regenerator().w(function (_context4) {
          while (1) switch (_context4.n) {
            case 0:
              _context4.n = 1;
              return favorite_db.favoriteDB.getAllFavorites();
            case 1:
              favorites = _context4.v;
              favoriteIds = new Set(favorites.map(function (fav) {
                return fav.id;
              }));
              listEl.innerHTML = this.stories.map(function (story, index) {
                return "\n            <div\n                class=\"story-item\"\n                data-index=\"".concat(index, "\"\n                role=\"listitem\"\n                tabindex=\"0\"\n                aria-label=\"Cerita oleh ").concat(story.name, "\"\n            >\n                <img\n                    src=\"").concat(story.photoUrl, "\"\n                    alt=\"Foto cerita oleh ").concat(story.name, "\"\n                    class=\"story-img\"\n                    loading=\"lazy\"\n                />\n                <div class=\"story-content\">\n                    <h3 class=\"story-title\">").concat(story.name, "</h3>\n                    <p class=\"story-desc\">").concat(story.description, "</p>\n                    <p class=\"story-date\">").concat(new Date(story.createdAt).toLocaleDateString(), "</p>\n                </div>\n                <button\n                    class=\"btn-favorite ").concat(favoriteIds.has(story.id) ? 'favorited' : '', "\"\n                    data-id=\"").concat(story.id, "\"\n                    aria-label=\"").concat(favoriteIds.has(story.id) ? 'Remove from favorites' : 'Add to favorites', "\"\n                >\n                    ").concat(favoriteIds.has(story.id) ? '❤️' : '🤍', "\n                </button>\n            </div>\n            ");
              }).join("");
            case 2:
              return _context4.a(2);
          }
        }, _callee4, this);
      }));
      function renderStoryList(_x3) {
        return _renderStoryList.apply(this, arguments);
      }
      return renderStoryList;
    }()
  }, {
    key: "toggleFavorite",
    value: function () {
      var _toggleFavorite = mapView_asyncToGenerator(/*#__PURE__*/mapView_regenerator().m(function _callee5(storyId) {
        var story, favorites, isFavorited, favoriteData, _t;
        return mapView_regenerator().w(function (_context5) {
          while (1) switch (_context5.p = _context5.n) {
            case 0:
              story = this.stories.find(function (s) {
                return s.id === storyId;
              });
              if (story) {
                _context5.n = 1;
                break;
              }
              return _context5.a(2);
            case 1:
              _context5.n = 2;
              return favorite_db.favoriteDB.getAllFavorites();
            case 2:
              favorites = _context5.v;
              isFavorited = favorites.some(function (fav) {
                return fav.id === storyId;
              });
              _context5.p = 3;
              if (!isFavorited) {
                _context5.n = 5;
                break;
              }
              _context5.n = 4;
              return favorite_db.favoriteDB.deleteFavorite(storyId);
            case 4:
              console.log("Removed from favorites:", story.name);
              _context5.n = 7;
              break;
            case 5:
              favoriteData = {
                id: story.id,
                name: story.name,
                description: story.description,
                photoUrl: story.photoUrl,
                lat: story.lat,
                lon: story.lon,
                createdAt: story.createdAt || new Date().toISOString()
              };
              _context5.n = 6;
              return favorite_db.favoriteDB.addFavorite(favoriteData);
            case 6:
              console.log("Added to favorites:", story.name);
            case 7:
              _context5.n = 9;
              break;
            case 8:
              _context5.p = 8;
              _t = _context5.v;
              console.error("Error toggling favorite:", _t);
              alert("Failed to update favorites");
            case 9:
              return _context5.a(2);
          }
        }, _callee5, this, [[3, 8]]);
      }));
      function toggleFavorite(_x4) {
        return _toggleFavorite.apply(this, arguments);
      }
      return toggleFavorite;
    }()
  }]);
}();

;// ./src/views/addstoryView.js
function addstoryView_typeof(o) { "@babel/helpers - typeof"; return addstoryView_typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, addstoryView_typeof(o); }
function addstoryView_regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return addstoryView_regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (addstoryView_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, addstoryView_regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, addstoryView_regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), addstoryView_regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", addstoryView_regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), addstoryView_regeneratorDefine2(u), addstoryView_regeneratorDefine2(u, o, "Generator"), addstoryView_regeneratorDefine2(u, n, function () { return this; }), addstoryView_regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (addstoryView_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function addstoryView_regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } addstoryView_regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { addstoryView_regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, addstoryView_regeneratorDefine2(e, r, n, t); }
function addstoryView_asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function addstoryView_asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { addstoryView_asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { addstoryView_asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function addstoryView_classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function addstoryView_defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, addstoryView_toPropertyKey(o.key), o); } }
function addstoryView_createClass(e, r, t) { return r && addstoryView_defineProperties(e.prototype, r), t && addstoryView_defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function addstoryView_toPropertyKey(t) { var i = addstoryView_toPrimitive(t, "string"); return "symbol" == addstoryView_typeof(i) ? i : i + ""; }
function addstoryView_toPrimitive(t, r) { if ("object" != addstoryView_typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != addstoryView_typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }

var AddStoryView = /*#__PURE__*/function () {
  function AddStoryView() {
    addstoryView_classCallCheck(this, AddStoryView);
  }
  return addstoryView_createClass(AddStoryView, [{
    key: "render",
    value: function render() {
      var _this = this;
      var div = document.createElement("div");
      div.className = "page page-add-story";
      div.setAttribute("role", "region");
      div.setAttribute("aria-labelledby", "add-story-title");
      div.innerHTML = "\n      <h1 id=\"add-story-title\" tabindex=\"0\">Tambah Cerita Baru</h1>\n\n      <form id=\"addStoryForm\" class=\"add-story-form\" aria-describedby=\"form-desc\">\n        <p id=\"form-desc\" class=\"sr-only\"></p>\n\n        <div class=\"form-group\">\n          <label for=\"description\">Deskripsi Cerita</label>\n          <textarea \n            id=\"description\" \n            name=\"description\" \n            placeholder=\"Tuliskan deskripsi...\" \n            aria-required=\"true\"\n            required\n          ></textarea>\n        </div>\n\n        <div class=\"form-group\">\n          <label for=\"photo\">Upload Gambar</label>\n          <input \n            type=\"file\" \n            id=\"photo\" \n            name=\"photo\" \n            accept=\"image/*\" \n            aria-required=\"true\"\n            required\n          >\n        </div>\n\n        <div class=\"form-group\" role=\"group\" aria-labelledby=\"map-label\">\n          <label id=\"map-label\">Pilih Lokasi di Peta</label>\n          <div id=\"map\" role=\"application\" aria-label=\"Peta untuk memilih lokasi cerita\"></div>\n          <p id=\"location-info\" aria-live=\"polite\">Belum ada lokasi dipilih.</p>\n        </div>\n\n        <button \n          type=\"submit\" \n          class=\"btn-submit\"\n          aria-label=\"Kirim Cerita\"\n        >\n          Kirim Cerita\n        </button>\n      </form>\n    ";

      // Pastikan peta diinisialisasi setelah elemen dimasukkan ke DOM
      setTimeout(function () {
        return _this.initMap();
      }, 100);
      return div;
    }
  }, {
    key: "initMap",
    value: function () {
      var _initMap = addstoryView_asyncToGenerator(/*#__PURE__*/addstoryView_regenerator().m(function _callee2() {
        var mapContainer, map, marker, locationInfo, form;
        return addstoryView_regenerator().w(function (_context2) {
          while (1) switch (_context2.n) {
            case 0:
              mapContainer = document.getElementById("map");
              if (mapContainer) {
                _context2.n = 1;
                break;
              }
              return _context2.a(2);
            case 1:
              map = L.map("map").setView([-2.5489, 118.0149], 5);
              L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
                maxZoom: 18
              }).addTo(map);
              locationInfo = document.getElementById("location-info");
              map.on("click", function (e) {
                var _e$latlng = e.latlng,
                  lat = _e$latlng.lat,
                  lng = _e$latlng.lng;
                if (marker) map.removeLayer(marker);
                marker = L.marker([lat, lng]).addTo(map);
                locationInfo.textContent = "Lokasi dipilih: ".concat(lat.toFixed(5), ", ").concat(lng.toFixed(5));
                locationInfo.dataset.lat = lat;
                locationInfo.dataset.lng = lng;
              });

              // Tangani submit form
              form = document.getElementById("addStoryForm");
              form.addEventListener("submit", /*#__PURE__*/function () {
                var _ref = addstoryView_asyncToGenerator(/*#__PURE__*/addstoryView_regenerator().m(function _callee(e) {
                  var formData, lat, lon, result, _yield$import, favoriteDB, _t;
                  return addstoryView_regenerator().w(function (_context) {
                    while (1) switch (_context.p = _context.n) {
                      case 0:
                        e.preventDefault();
                        formData = new FormData(form);
                        lat = locationInfo.dataset.lat;
                        lon = locationInfo.dataset.lng;
                        if (!(!lat || !lon)) {
                          _context.n = 1;
                          break;
                        }
                        alert("Silakan pilih lokasi di peta terlebih dahulu!");
                        return _context.a(2);
                      case 1:
                        formData.append("lat", lat);
                        formData.append("lon", lon);

                        // Try to submit online first
                        _context.n = 2;
                        return apiModel.addStory(formData);
                      case 2:
                        result = _context.v;
                        if (!result.error) {
                          _context.n = 10;
                          break;
                        }
                        if (navigator.onLine) {
                          _context.n = 8;
                          break;
                        }
                        _context.p = 3;
                        _context.n = 4;
                        return Promise.resolve(/* import() */).then(__webpack_require__.bind(__webpack_require__, 460));
                      case 4:
                        _yield$import = _context.v;
                        favoriteDB = _yield$import.favoriteDB;
                        _context.n = 5;
                        return favoriteDB.addOfflineStory(formData);
                      case 5:
                        alert("📱 Cerita disimpan offline. Akan disinkronkan saat online.");
                        window.location.hash = "/";
                        _context.n = 7;
                        break;
                      case 6:
                        _context.p = 6;
                        _t = _context.v;
                        console.error("❌ Gagal menyimpan offline:", _t);
                        alert("❌ Gagal menambahkan cerita dan tidak dapat menyimpan offline.");
                      case 7:
                        _context.n = 9;
                        break;
                      case 8:
                        alert("❌ Gagal menambahkan cerita: " + result.message);
                      case 9:
                        _context.n = 11;
                        break;
                      case 10:
                        alert("✅ Cerita berhasil ditambahkan!");
                        window.location.hash = "#/map";
                      case 11:
                        return _context.a(2);
                    }
                  }, _callee, null, [[3, 6]]);
                }));
                return function (_x) {
                  return _ref.apply(this, arguments);
                };
              }());
            case 2:
              return _context2.a(2);
          }
        }, _callee2);
      }));
      function initMap() {
        return _initMap.apply(this, arguments);
      }
      return initMap;
    }()
  }]);
}();

;// ./src/views/favoritesView.js
function favoritesView_typeof(o) { "@babel/helpers - typeof"; return favoritesView_typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, favoritesView_typeof(o); }
function _toConsumableArray(r) { return _arrayWithoutHoles(r) || _iterableToArray(r) || _unsupportedIterableToArray(r) || _nonIterableSpread(); }
function _nonIterableSpread() { throw new TypeError("Invalid attempt to spread non-iterable instance.\nIn order to be iterable, non-array objects must have a [Symbol.iterator]() method."); }
function _unsupportedIterableToArray(r, a) { if (r) { if ("string" == typeof r) return _arrayLikeToArray(r, a); var t = {}.toString.call(r).slice(8, -1); return "Object" === t && r.constructor && (t = r.constructor.name), "Map" === t || "Set" === t ? Array.from(r) : "Arguments" === t || /^(?:Ui|I)nt(?:8|16|32)(?:Clamped)?Array$/.test(t) ? _arrayLikeToArray(r, a) : void 0; } }
function _iterableToArray(r) { if ("undefined" != typeof Symbol && null != r[Symbol.iterator] || null != r["@@iterator"]) return Array.from(r); }
function _arrayWithoutHoles(r) { if (Array.isArray(r)) return _arrayLikeToArray(r); }
function _arrayLikeToArray(r, a) { (null == a || a > r.length) && (a = r.length); for (var e = 0, n = Array(a); e < a; e++) n[e] = r[e]; return n; }
function favoritesView_regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return favoritesView_regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (favoritesView_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, favoritesView_regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, favoritesView_regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), favoritesView_regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", favoritesView_regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), favoritesView_regeneratorDefine2(u), favoritesView_regeneratorDefine2(u, o, "Generator"), favoritesView_regeneratorDefine2(u, n, function () { return this; }), favoritesView_regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (favoritesView_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function favoritesView_regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } favoritesView_regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { favoritesView_regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, favoritesView_regeneratorDefine2(e, r, n, t); }
function favoritesView_asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function favoritesView_asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { favoritesView_asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { favoritesView_asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function favoritesView_classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function favoritesView_defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, favoritesView_toPropertyKey(o.key), o); } }
function favoritesView_createClass(e, r, t) { return r && favoritesView_defineProperties(e.prototype, r), t && favoritesView_defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function favoritesView_toPropertyKey(t) { var i = favoritesView_toPrimitive(t, "string"); return "symbol" == favoritesView_typeof(i) ? i : i + ""; }
function favoritesView_toPrimitive(t, r) { if ("object" != favoritesView_typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != favoritesView_typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }


var FavoritesView = /*#__PURE__*/function () {
  function FavoritesView() {
    favoritesView_classCallCheck(this, FavoritesView);
    this.favorites = [];
    this.filteredFavorites = [];
    this.searchQuery = "";
    this.sortOrder = "desc"; // desc or asc
    this.sortBy = "date"; // date or name
  }
  return favoritesView_createClass(FavoritesView, [{
    key: "render",
    value: function render() {
      var div = document.createElement("div");
      div.className = "page page-favorites";
      div.setAttribute("role", "region");
      div.setAttribute("aria-labelledby", "favorites-title");
      div.innerHTML = "\n            <h1 id=\"favorites-title\" class=\"page-title\" tabindex=\"0\">My Favorites</h1>\n\n            <div class=\"favorites-controls\">\n                <div class=\"search-container\">\n                    <input\n                        type=\"text\"\n                        id=\"search-favorites\"\n                        placeholder=\"Search favorites...\"\n                        aria-label=\"Search favorites\"\n                    >\n                    <button id=\"clear-search\" class=\"btn-clear\">Clear</button>\n                </div>\n\n                <div class=\"sort-controls\">\n                    <label for=\"sort-by\">Sort by:</label>\n                    <select id=\"sort-by\" aria-label=\"Sort favorites by\">\n                        <option value=\"date\">Date</option>\n                        <option value=\"name\">Name</option>\n                    </select>\n\n                    <label for=\"sort-order\">Order:</label>\n                    <select id=\"sort-order\" aria-label=\"Sort order\">\n                        <option value=\"desc\">Newest First</option>\n                        <option value=\"asc\">Oldest First</option>\n                    </select>\n                </div>\n            </div>\n\n            <div id=\"favorites-list\" class=\"favorites-list\" role=\"list\" aria-label=\"List of favorite stories\">\n                <p class=\"loading\">Loading favorites...</p>\n            </div>\n        ";
      return div;
    }
  }, {
    key: "afterRender",
    value: function () {
      var _afterRender = favoritesView_asyncToGenerator(/*#__PURE__*/favoritesView_regenerator().m(function _callee() {
        var _this = this;
        var searchInput, clearBtn, sortBySelect, sortOrderSelect;
        return favoritesView_regenerator().w(function (_context) {
          while (1) switch (_context.n) {
            case 0:
              _context.n = 1;
              return this.loadFavorites();
            case 1:
              // Search functionality
              searchInput = document.getElementById("search-favorites");
              clearBtn = document.getElementById("clear-search");
              sortBySelect = document.getElementById("sort-by");
              sortOrderSelect = document.getElementById("sort-order");
              searchInput.addEventListener("input", function (e) {
                _this.searchQuery = e.target.value.toLowerCase();
                _this.applyFilters();
              });
              clearBtn.addEventListener("click", function () {
                searchInput.value = "";
                _this.searchQuery = "";
                _this.applyFilters();
              });
              sortBySelect.addEventListener("change", function (e) {
                _this.sortBy = e.target.value;
                _this.applyFilters();
              });
              sortOrderSelect.addEventListener("change", function (e) {
                _this.sortOrder = e.target.value;
                _this.applyFilters();
              });
            case 2:
              return _context.a(2);
          }
        }, _callee, this);
      }));
      function afterRender() {
        return _afterRender.apply(this, arguments);
      }
      return afterRender;
    }()
  }, {
    key: "loadFavorites",
    value: function () {
      var _loadFavorites = favoritesView_asyncToGenerator(/*#__PURE__*/favoritesView_regenerator().m(function _callee2() {
        var _t;
        return favoritesView_regenerator().w(function (_context2) {
          while (1) switch (_context2.p = _context2.n) {
            case 0:
              _context2.p = 0;
              _context2.n = 1;
              return favorite_db.favoriteDB.getAllFavorites();
            case 1:
              this.favorites = _context2.v;
              this.applyFilters();
              _context2.n = 3;
              break;
            case 2:
              _context2.p = 2;
              _t = _context2.v;
              console.error("Error loading favorites:", _t);
              this.showError("Failed to load favorites");
            case 3:
              return _context2.a(2);
          }
        }, _callee2, this, [[0, 2]]);
      }));
      function loadFavorites() {
        return _loadFavorites.apply(this, arguments);
      }
      return loadFavorites;
    }()
  }, {
    key: "applyFilters",
    value: function applyFilters() {
      var _this2 = this;
      var filtered = _toConsumableArray(this.favorites);

      // Apply search by name only
      if (this.searchQuery) {
        filtered = filtered.filter(function (story) {
          return story.name.toLowerCase().includes(_this2.searchQuery);
        });
      }

      // Apply sorting
      if (this.sortBy === "date") {
        filtered.sort(function (a, b) {
          var dateA = new Date(a.createdAt || 0);
          var dateB = new Date(b.createdAt || 0);
          return _this2.sortOrder === "desc" ? dateB - dateA : dateA - dateB;
        });
      } else if (this.sortBy === "name") {
        filtered.sort(function (a, b) {
          var nameA = a.name.toLowerCase();
          var nameB = b.name.toLowerCase();
          if (_this2.sortOrder === "asc") {
            return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
          } else {
            return nameA > nameB ? -1 : nameA < nameB ? 1 : 0;
          }
        });
      }
      this.filteredFavorites = filtered;
      this.renderFavoritesList();
    }
  }, {
    key: "renderFavoritesList",
    value: function renderFavoritesList() {
      var _this3 = this;
      var container = document.getElementById("favorites-list");
      if (this.filteredFavorites.length === 0) {
        if (this.favorites.length === 0) {
          container.innerHTML = '<p class="empty-state">No favorites yet. Add some stories to your favorites!</p>';
        } else {
          container.innerHTML = '<p class="empty-state">No favorites match your search.</p>';
        }
        return;
      }
      container.innerHTML = this.filteredFavorites.map(function (story) {
        return "\n            <div class=\"favorite-item\" role=\"listitem\" data-id=\"".concat(story.id, "\">\n                <img \n                    src=\"").concat(_this3.escapeHtml(story.photoUrl), "\" \n                    alt=\"Foto favorit ").concat(_this3.escapeHtml(story.name), "\" \n                    class=\"favorite-img\" \n                    loading=\"lazy\"\n                />\n                <div class=\"favorite-content\">\n                    <h3 class=\"favorite-title\">").concat(_this3.escapeHtml(story.name), "</h3>\n                    <p class=\"favorite-description\">").concat(_this3.escapeHtml(story.description), "</p>\n                    <small class=\"favorite-date\">\n                        Created: ").concat(new Date(story.createdAt).toLocaleDateString(), "\n                    </small>\n                </div>\n                <div class=\"favorite-actions\">\n                    <button class=\"btn-remove-favorite\" data-id=\"").concat(story.id, "\" aria-label=\"Remove from favorites\">\n                        Remove\n                    </button>\n                </div>\n            </div>\n        ");
      }).join("");

      // Add event listeners for remove buttons
      container.querySelectorAll(".btn-remove-favorite").forEach(function (btn) {
        btn.addEventListener("click", /*#__PURE__*/function () {
          var _ref = favoritesView_asyncToGenerator(/*#__PURE__*/favoritesView_regenerator().m(function _callee3(e) {
            var id;
            return favoritesView_regenerator().w(function (_context3) {
              while (1) switch (_context3.n) {
                case 0:
                  id = e.target.dataset.id;
                  _context3.n = 1;
                  return _this3.removeFavorite(id);
                case 1:
                  return _context3.a(2);
              }
            }, _callee3);
          }));
          return function (_x) {
            return _ref.apply(this, arguments);
          };
        }());
      });
    }
  }, {
    key: "removeFavorite",
    value: function () {
      var _removeFavorite = favoritesView_asyncToGenerator(/*#__PURE__*/favoritesView_regenerator().m(function _callee4(id) {
        var _t2;
        return favoritesView_regenerator().w(function (_context4) {
          while (1) switch (_context4.p = _context4.n) {
            case 0:
              _context4.p = 0;
              _context4.n = 1;
              return favorite_db.favoriteDB.deleteFavorite(id);
            case 1:
              _context4.n = 2;
              return this.loadFavorites();
            case 2:
              // Reload the list
              console.log("Favorite removed:", id);
              _context4.n = 4;
              break;
            case 3:
              _context4.p = 3;
              _t2 = _context4.v;
              console.error("Error removing favorite:", _t2);
              alert("Failed to remove favorite");
            case 4:
              return _context4.a(2);
          }
        }, _callee4, this, [[0, 3]]);
      }));
      function removeFavorite(_x2) {
        return _removeFavorite.apply(this, arguments);
      }
      return removeFavorite;
    }()
  }, {
    key: "showError",
    value: function showError(message) {
      var container = document.getElementById("favorites-list");
      container.innerHTML = "<p class=\"error-state\">".concat(message, "</p>");
    }
  }, {
    key: "escapeHtml",
    value: function escapeHtml(text) {
      var div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }
  }]);
}();

;// ./src/views/login-page.js
function login_page_typeof(o) { "@babel/helpers - typeof"; return login_page_typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, login_page_typeof(o); }
function login_page_regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return login_page_regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (login_page_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, login_page_regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, login_page_regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), login_page_regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", login_page_regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), login_page_regeneratorDefine2(u), login_page_regeneratorDefine2(u, o, "Generator"), login_page_regeneratorDefine2(u, n, function () { return this; }), login_page_regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (login_page_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function login_page_regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } login_page_regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { login_page_regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, login_page_regeneratorDefine2(e, r, n, t); }
function login_page_asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function login_page_asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { login_page_asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { login_page_asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function login_page_classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function login_page_defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, login_page_toPropertyKey(o.key), o); } }
function login_page_createClass(e, r, t) { return r && login_page_defineProperties(e.prototype, r), t && login_page_defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function login_page_toPropertyKey(t) { var i = login_page_toPrimitive(t, "string"); return "symbol" == login_page_typeof(i) ? i : i + ""; }
function login_page_toPrimitive(t, r) { if ("object" != login_page_typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != login_page_typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }

var LoginPage = /*#__PURE__*/function () {
  function LoginPage() {
    login_page_classCallCheck(this, LoginPage);
  }
  return login_page_createClass(LoginPage, [{
    key: "render",
    value: function () {
      var _render = login_page_asyncToGenerator(/*#__PURE__*/login_page_regenerator().m(function _callee() {
        var container;
        return login_page_regenerator().w(function (_context) {
          while (1) switch (_context.n) {
            case 0:
              container = document.createElement("section");
              container.classList.add("auth-section");
              container.innerHTML = "\n      <h2>Login</h2>\n      <form id=\"loginForm\" class=\"auth-form\">\n        <input type=\"email\" id=\"email\" name=\"email\" placeholder=\"Email\" required />\n        <input type=\"password\" id=\"password\" name=\"password\" placeholder=\"Password\" required />\n        <button type=\"submit\">Login</button>\n      </form>\n      <p>Belum punya akun? <a href=\"#/register\">Daftar di sini</a></p>\n    ";
              return _context.a(2, container);
          }
        }, _callee);
      }));
      function render() {
        return _render.apply(this, arguments);
      }
      return render;
    }()
  }, {
    key: "afterRender",
    value: function () {
      var _afterRender = login_page_asyncToGenerator(/*#__PURE__*/login_page_regenerator().m(function _callee3() {
        var form;
        return login_page_regenerator().w(function (_context3) {
          while (1) switch (_context3.n) {
            case 0:
              console.log("✅ LoginPage.afterRender() terpanggil!");
              form = document.getElementById("loginForm");
              if (form) {
                _context3.n = 1;
                break;
              }
              console.error("❌ Elemen form login tidak ditemukan!");
              return _context3.a(2);
            case 1:
              form.addEventListener("submit", /*#__PURE__*/function () {
                var _ref = login_page_asyncToGenerator(/*#__PURE__*/login_page_regenerator().m(function _callee2(e) {
                  var email, password, button, result, _t;
                  return login_page_regenerator().w(function (_context2) {
                    while (1) switch (_context2.p = _context2.n) {
                      case 0:
                        e.preventDefault();

                        // Ambil nilai input secara aman
                        email = document.querySelector("#email").value.trim();
                        password = document.querySelector("#password").value.trim();
                        if (!(!email || !password)) {
                          _context2.n = 1;
                          break;
                        }
                        alert("Email dan password wajib diisi!");
                        return _context2.a(2);
                      case 1:
                        // Feedback loading
                        button = form.querySelector("button");
                        button.disabled = true;
                        button.textContent = "Masuk...";
                        _context2.p = 2;
                        _context2.n = 3;
                        return apiModel.login(email, password);
                      case 3:
                        result = _context2.v;
                        alert(result.message);
                        if (result.success) {
                          window.location.hash = "#/"; // arahkan ke halaman utama
                        }
                        _context2.n = 5;
                        break;
                      case 4:
                        _context2.p = 4;
                        _t = _context2.v;
                        console.error("⚠️ Terjadi kesalahan saat login:", _t);
                        alert("Terjadi kesalahan. Coba lagi nanti.");
                      case 5:
                        _context2.p = 5;
                        button.disabled = false;
                        button.textContent = "Login";
                        return _context2.f(5);
                      case 6:
                        return _context2.a(2);
                    }
                  }, _callee2, null, [[2, 4, 5, 6]]);
                }));
                return function (_x) {
                  return _ref.apply(this, arguments);
                };
              }());
            case 2:
              return _context3.a(2);
          }
        }, _callee3);
      }));
      function afterRender() {
        return _afterRender.apply(this, arguments);
      }
      return afterRender;
    }()
  }]);
}();
/* harmony default export */ const login_page = (LoginPage);
;// ./src/views/register-page.js
function register_page_typeof(o) { "@babel/helpers - typeof"; return register_page_typeof = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ? function (o) { return typeof o; } : function (o) { return o && "function" == typeof Symbol && o.constructor === Symbol && o !== Symbol.prototype ? "symbol" : typeof o; }, register_page_typeof(o); }
function register_page_regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return register_page_regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (register_page_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, register_page_regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, register_page_regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), register_page_regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", register_page_regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), register_page_regeneratorDefine2(u), register_page_regeneratorDefine2(u, o, "Generator"), register_page_regeneratorDefine2(u, n, function () { return this; }), register_page_regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (register_page_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function register_page_regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } register_page_regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { register_page_regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, register_page_regeneratorDefine2(e, r, n, t); }
function register_page_asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function register_page_asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { register_page_asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { register_page_asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }
function register_page_classCallCheck(a, n) { if (!(a instanceof n)) throw new TypeError("Cannot call a class as a function"); }
function register_page_defineProperties(e, r) { for (var t = 0; t < r.length; t++) { var o = r[t]; o.enumerable = o.enumerable || !1, o.configurable = !0, "value" in o && (o.writable = !0), Object.defineProperty(e, register_page_toPropertyKey(o.key), o); } }
function register_page_createClass(e, r, t) { return r && register_page_defineProperties(e.prototype, r), t && register_page_defineProperties(e, t), Object.defineProperty(e, "prototype", { writable: !1 }), e; }
function register_page_toPropertyKey(t) { var i = register_page_toPrimitive(t, "string"); return "symbol" == register_page_typeof(i) ? i : i + ""; }
function register_page_toPrimitive(t, r) { if ("object" != register_page_typeof(t) || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != register_page_typeof(i)) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); }

var RegisterPage = /*#__PURE__*/function () {
  function RegisterPage() {
    register_page_classCallCheck(this, RegisterPage);
  }
  return register_page_createClass(RegisterPage, [{
    key: "render",
    value: function () {
      var _render = register_page_asyncToGenerator(/*#__PURE__*/register_page_regenerator().m(function _callee() {
        var container;
        return register_page_regenerator().w(function (_context) {
          while (1) switch (_context.n) {
            case 0:
              container = document.createElement("section");
              container.classList.add("auth-section");
              container.innerHTML = "\n      <h2>Register</h2>\n      <form id=\"registerForm\" class=\"auth-form\">\n        <input type=\"text\" id=\"name\" name=\"name\" placeholder=\"Nama Lengkap\" required />\n        <input type=\"email\" id=\"email\" name=\"email\" placeholder=\"Email\" required />\n        <input type=\"password\" id=\"password\" name=\"password\" placeholder=\"Password\" required minlength=\"8\" />\n        <button type=\"submit\">Daftar</button>\n      </form>\n      <p>Sudah punya akun? <a href=\"#/login\">Login di sini</a></p>\n    ";
              return _context.a(2, container);
          }
        }, _callee);
      }));
      function render() {
        return _render.apply(this, arguments);
      }
      return render;
    }()
  }, {
    key: "afterRender",
    value: function () {
      var _afterRender = register_page_asyncToGenerator(/*#__PURE__*/register_page_regenerator().m(function _callee3() {
        var form;
        return register_page_regenerator().w(function (_context3) {
          while (1) switch (_context3.n) {
            case 0:
              console.log("✅ RegisterPage.afterRender() terpanggil!");
              form = document.getElementById("registerForm");
              if (form) {
                _context3.n = 1;
                break;
              }
              console.error("❌ Elemen form tidak ditemukan!");
              return _context3.a(2);
            case 1:
              form.addEventListener("submit", /*#__PURE__*/function () {
                var _ref = register_page_asyncToGenerator(/*#__PURE__*/register_page_regenerator().m(function _callee2(e) {
                  var name, email, password, button, result, _t;
                  return register_page_regenerator().w(function (_context2) {
                    while (1) switch (_context2.p = _context2.n) {
                      case 0:
                        e.preventDefault();

                        // Ambil nilai input dengan cara yang aman
                        name = document.querySelector("#name").value.trim();
                        email = document.querySelector("#email").value.trim();
                        password = document.querySelector("#password").value.trim();
                        if (!(!name || !email || !password)) {
                          _context2.n = 1;
                          break;
                        }
                        alert("Semua kolom wajib diisi!");
                        return _context2.a(2);
                      case 1:
                        // Tampilkan indikator loading sederhana
                        button = form.querySelector("button");
                        button.disabled = true;
                        button.textContent = "Mendaftar...";
                        _context2.p = 2;
                        _context2.n = 3;
                        return apiModel.register(name, email, password);
                      case 3:
                        result = _context2.v;
                        alert(result.message);
                        if (result.success) {
                          window.location.hash = "#/login";
                        }
                        _context2.n = 5;
                        break;
                      case 4:
                        _context2.p = 4;
                        _t = _context2.v;
                        console.error("⚠️ Terjadi kesalahan saat register:", _t);
                        alert("Terjadi kesalahan. Coba lagi nanti.");
                      case 5:
                        _context2.p = 5;
                        button.disabled = false;
                        button.textContent = "Daftar";
                        return _context2.f(5);
                      case 6:
                        return _context2.a(2);
                    }
                  }, _callee2, null, [[2, 4, 5, 6]]);
                }));
                return function (_x) {
                  return _ref.apply(this, arguments);
                };
              }());
            case 2:
              return _context3.a(2);
          }
        }, _callee3);
      }));
      function afterRender() {
        return _afterRender.apply(this, arguments);
      }
      return afterRender;
    }()
  }]);
}();
/* harmony default export */ const register_page = (RegisterPage);
;// ./src/router.js
function router_regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return router_regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (router_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, router_regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, router_regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), router_regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", router_regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), router_regeneratorDefine2(u), router_regeneratorDefine2(u, o, "Generator"), router_regeneratorDefine2(u, n, function () { return this; }), router_regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (router_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function router_regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } router_regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { router_regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, router_regeneratorDefine2(e, r, n, t); }
function router_asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function router_asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { router_asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { router_asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }










var routes = {
  "/": HomeView,
  "/about": AboutView,
  "/contact": ContactView,
  "/map": MapView,
  "/add-story": AddStoryView,
  "/favorites": FavoritesView,
  "/login": login_page,
  "/register": register_page
};

/* ==============================
   🔧 Fungsi Update Navbar Dinamis
============================== */
function updateNavbarUI() {
  var navbar = document.querySelector(".navbar");
  if (!navbar) return;

  // cari atau buat div kanan untuk tombol login/logout
  var navRight = navbar.querySelector(".nav-right");
  if (!navRight) {
    navRight = document.createElement("div");
    navRight.classList.add("nav-right");
    navbar.appendChild(navRight);
  }

  // kosongkan dulu
  navRight.innerHTML = "";
  if (apiModel.isLoggedIn()) {
    // Jika sudah login → tampilkan tombol Logout
    var logoutBtn = document.createElement("a");
    logoutBtn.href = "#/login";
    logoutBtn.textContent = "Logout";
    logoutBtn.classList.add("nav-link");
    logoutBtn.addEventListener("click", function (e) {
      e.preventDefault();
      apiModel.logout();
      window.location.hash = "#/login";
      updateNavbarUI(); // refresh tampilan navbar
    });
    navRight.appendChild(logoutBtn);
  } else {
    // Jika belum login → tampilkan tombol Login & Register
    var loginBtn = document.createElement("a");
    loginBtn.href = "#/login";
    loginBtn.textContent = "Login";
    loginBtn.classList.add("nav-link");
    var registerBtn = document.createElement("a");
    registerBtn.href = "#/register";
    registerBtn.textContent = "Register";
    registerBtn.classList.add("nav-link");
    navRight.appendChild(loginBtn);
    navRight.appendChild(registerBtn);
  }
}

/* ==============================
   🚦 Router SPA
============================== */
function initRouter() {
  window.addEventListener("hashchange", renderPage);
  renderPage(); // Initial render
}
function renderPage() {
  return _renderPage.apply(this, arguments);
}
function _renderPage() {
  _renderPage = router_asyncToGenerator(/*#__PURE__*/router_regenerator().m(function _callee2() {
    var app, path, publicRoutes, isPublic, Page, transition, pageInstance, presenter, view;
    return router_regenerator().w(function (_context2) {
      while (1) switch (_context2.n) {
        case 0:
          app = document.getElementById("app");
          path = location.hash.slice(1).toLowerCase() || "/";
          publicRoutes = ["/login", "/register"];
          isPublic = publicRoutes.includes(path); // jika belum login & bukan di halaman publik
          if (!(!isPublic && !apiModel.isLoggedIn())) {
            _context2.n = 1;
            break;
          }
          console.warn("🔒 Pengguna belum login, mengarahkan ke /login...");
          window.location.hash = "#/login";
          return _context2.a(2);
        case 1:
          if (!(isPublic && apiModel.isLoggedIn())) {
            _context2.n = 2;
            break;
          }
          window.location.hash = "#/";
          return _context2.a(2);
        case 2:
          Page = routes[path] || HomeView; // Use View Transition API if supported
          if (!document.startViewTransition) {
            _context2.n = 3;
            break;
          }
          transition = document.startViewTransition(/*#__PURE__*/router_asyncToGenerator(/*#__PURE__*/router_regenerator().m(function _callee() {
            var pageInstance, presenter, view;
            return router_regenerator().w(function (_context) {
              while (1) switch (_context.n) {
                case 0:
                  app.innerHTML = "";
                  pageInstance = new Page();
                  presenter = new PagePresenter(pageInstance);
                  _context.n = 1;
                  return presenter.getView();
                case 1:
                  view = _context.v;
                  if (!view) {
                    _context.n = 3;
                    break;
                  }
                  view.classList.add("view-transition");
                  app.appendChild(view);

                  // Pastikan afterRender() terpanggil jika ada
                  if (!pageInstance.afterRender) {
                    _context.n = 2;
                    break;
                  }
                  _context.n = 2;
                  return pageInstance.afterRender();
                case 2:
                  _context.n = 4;
                  break;
                case 3:
                  console.error("View tidak ditemukan untuk route:", path);
                case 4:
                  return _context.a(2);
              }
            }, _callee);
          }))); // Update navbar after transition
          transition.finished.then(function () {
            updateNavbarUI();
          });
          _context2.n = 8;
          break;
        case 3:
          // Fallback for browsers without View Transition API
          app.innerHTML = "";
          pageInstance = new Page();
          presenter = new PagePresenter(pageInstance);
          _context2.n = 4;
          return presenter.getView();
        case 4:
          view = _context2.v;
          if (!view) {
            _context2.n = 6;
            break;
          }
          view.classList.add("view-transition");
          app.appendChild(view);

          // Pastikan afterRender() terpanggil jika ada
          if (!pageInstance.afterRender) {
            _context2.n = 5;
            break;
          }
          _context2.n = 5;
          return pageInstance.afterRender();
        case 5:
          _context2.n = 7;
          break;
        case 6:
          console.error("View tidak ditemukan untuk route:", path);
        case 7:
          // Update tombol navbar sesuai status login
          updateNavbarUI();
        case 8:
          return _context2.a(2);
      }
    }, _callee2);
  }));
  return _renderPage.apply(this, arguments);
}
;// ./src/main.js
function main_regenerator() { /*! regenerator-runtime -- Copyright (c) 2014-present, Facebook, Inc. -- license (MIT): https://github.com/babel/babel/blob/main/packages/babel-helpers/LICENSE */ var e, t, r = "function" == typeof Symbol ? Symbol : {}, n = r.iterator || "@@iterator", o = r.toStringTag || "@@toStringTag"; function i(r, n, o, i) { var c = n && n.prototype instanceof Generator ? n : Generator, u = Object.create(c.prototype); return main_regeneratorDefine2(u, "_invoke", function (r, n, o) { var i, c, u, f = 0, p = o || [], y = !1, G = { p: 0, n: 0, v: e, a: d, f: d.bind(e, 4), d: function d(t, r) { return i = t, c = 0, u = e, G.n = r, a; } }; function d(r, n) { for (c = r, u = n, t = 0; !y && f && !o && t < p.length; t++) { var o, i = p[t], d = G.p, l = i[2]; r > 3 ? (o = l === n) && (u = i[(c = i[4]) ? 5 : (c = 3, 3)], i[4] = i[5] = e) : i[0] <= d && ((o = r < 2 && d < i[1]) ? (c = 0, G.v = n, G.n = i[1]) : d < l && (o = r < 3 || i[0] > n || n > l) && (i[4] = r, i[5] = n, G.n = l, c = 0)); } if (o || r > 1) return a; throw y = !0, n; } return function (o, p, l) { if (f > 1) throw TypeError("Generator is already running"); for (y && 1 === p && d(p, l), c = p, u = l; (t = c < 2 ? e : u) || !y;) { i || (c ? c < 3 ? (c > 1 && (G.n = -1), d(c, u)) : G.n = u : G.v = u); try { if (f = 2, i) { if (c || (o = "next"), t = i[o]) { if (!(t = t.call(i, u))) throw TypeError("iterator result is not an object"); if (!t.done) return t; u = t.value, c < 2 && (c = 0); } else 1 === c && (t = i["return"]) && t.call(i), c < 2 && (u = TypeError("The iterator does not provide a '" + o + "' method"), c = 1); i = e; } else if ((t = (y = G.n < 0) ? u : r.call(n, G)) !== a) break; } catch (t) { i = e, c = 1, u = t; } finally { f = 1; } } return { value: t, done: y }; }; }(r, o, i), !0), u; } var a = {}; function Generator() {} function GeneratorFunction() {} function GeneratorFunctionPrototype() {} t = Object.getPrototypeOf; var c = [][n] ? t(t([][n]())) : (main_regeneratorDefine2(t = {}, n, function () { return this; }), t), u = GeneratorFunctionPrototype.prototype = Generator.prototype = Object.create(c); function f(e) { return Object.setPrototypeOf ? Object.setPrototypeOf(e, GeneratorFunctionPrototype) : (e.__proto__ = GeneratorFunctionPrototype, main_regeneratorDefine2(e, o, "GeneratorFunction")), e.prototype = Object.create(u), e; } return GeneratorFunction.prototype = GeneratorFunctionPrototype, main_regeneratorDefine2(u, "constructor", GeneratorFunctionPrototype), main_regeneratorDefine2(GeneratorFunctionPrototype, "constructor", GeneratorFunction), GeneratorFunction.displayName = "GeneratorFunction", main_regeneratorDefine2(GeneratorFunctionPrototype, o, "GeneratorFunction"), main_regeneratorDefine2(u), main_regeneratorDefine2(u, o, "Generator"), main_regeneratorDefine2(u, n, function () { return this; }), main_regeneratorDefine2(u, "toString", function () { return "[object Generator]"; }), (main_regenerator = function _regenerator() { return { w: i, m: f }; })(); }
function main_regeneratorDefine2(e, r, n, t) { var i = Object.defineProperty; try { i({}, "", {}); } catch (e) { i = 0; } main_regeneratorDefine2 = function _regeneratorDefine(e, r, n, t) { function o(r, n) { main_regeneratorDefine2(e, r, function (e) { return this._invoke(r, n, e); }); } r ? i ? i(e, r, { value: n, enumerable: !t, configurable: !t, writable: !t }) : e[r] = n : (o("next", 0), o("throw", 1), o("return", 2)); }, main_regeneratorDefine2(e, r, n, t); }
function main_asyncGeneratorStep(n, t, e, r, o, a, c) { try { var i = n[a](c), u = i.value; } catch (n) { return void e(n); } i.done ? t(u) : Promise.resolve(u).then(r, o); }
function main_asyncToGenerator(n) { return function () { var t = this, e = arguments; return new Promise(function (r, o) { var a = n.apply(t, e); function _next(n) { main_asyncGeneratorStep(a, r, o, _next, _throw, "next", n); } function _throw(n) { main_asyncGeneratorStep(a, r, o, _next, _throw, "throw", n); } _next(void 0); }); }; }




document.addEventListener("DOMContentLoaded", function () {
  initRouter();

  // Sync offline stories when coming back online
  window.addEventListener("online", /*#__PURE__*/main_asyncToGenerator(/*#__PURE__*/main_regenerator().m(function _callee() {
    var _t;
    return main_regenerator().w(function (_context) {
      while (1) switch (_context.p = _context.n) {
        case 0:
          console.log("🌐 Koneksi kembali online, sinkronisasi data offline...");
          _context.p = 1;
          _context.n = 2;
          return favorite_db.favoriteDB.syncOfflineStories(apiModel);
        case 2:
          console.log("✅ Sinkronisasi selesai");
          _context.n = 4;
          break;
        case 3:
          _context.p = 3;
          _t = _context.v;
          console.error("❌ Gagal sinkronisasi:", _t);
        case 4:
          return _context.a(2);
      }
    }, _callee, null, [[1, 3]]);
  })));
});
/******/ })()
;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,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Q0FBQTtNQUFBO0lBQUEsR0FBQXVDLE9BQUE7RUFBQSxDQUVuRCxHQUFDO0FBQ04sQ0FBQyxDQUFDLEMiLCJzb3VyY2VzIjpbIndlYnBhY2s6Ly9zcGEtc3RvcnktbWFwLy4vbm9kZV9tb2R1bGVzL2lkYi9idWlsZC93cmFwLWlkYi12YWx1ZS5qcyIsIndlYnBhY2s6Ly9zcGEtc3RvcnktbWFwLy4vbm9kZV9tb2R1bGVzL2lkYi9idWlsZC9pbmRleC5qcyIsIndlYnBhY2s6Ly9zcGEtc3RvcnktbWFwLy4vc3JjL2RiL2Zhdm9yaXRlLWRiLmpzIiwid2VicGFjazovL3NwYS1zdG9yeS1tYXAvd2VicGFjay9ib290c3RyYXAiLCJ3ZWJwYWNrOi8vc3BhLXN0b3J5LW1hcC93ZWJwYWNrL3J1bnRpbWUvZGVmaW5lIHByb3BlcnR5IGdldHRlcnMiLCJ3ZWJwYWNrOi8vc3BhLXN0b3J5LW1hcC93ZWJwYWNrL3J1bnRpbWUvaGFzT3duUHJvcGVydHkgc2hvcnRoYW5kIiwid2VicGFjazovL3NwYS1zdG9yeS1tYXAvd2VicGFjay9ydW50aW1lL21ha2UgbmFtZXNwYWNlIG9iamVjdCIsIndlYnBhY2s6Ly9zcGEtc3RvcnktbWFwLy4vc3JjL3ByZXNlbnRlcnMvcGFnZVByZXNlbnRlci5qcyIsIndlYnBhY2s6Ly9zcGEtc3RvcnktbWFwLy4vc3JjL21vZGVscy9kYXRhTW9kZWwuanMiLCJ3ZWJwYWNrOi8vc3BhLXN0b3J5LW1hcC8uL3NyYy9tb2RlbHMvYXBpTW9kZWwuanMiLCJ3ZWJwYWNrOi8vc3BhLXN0b3J5LW1hcC8uL3NjcmlwdHMvcHdhLWluaXQuanMiLCJ3ZWJwYWNrOi8vc3BhLXN0b3J5LW1hcC8uL3NyYy92aWV3cy9ob21lVmlldy5qcyIsIndlYnBhY2s6Ly9zcGEtc3RvcnktbWFwLy4vc3JjL3ZpZXdzL2Fib3V0Vmlldy5qcyIsIndlYnBhY2s6Ly9zcGEtc3RvcnktbWFwLy4vc3JjL3ZpZXdzL2NvbnRhY3RWaWV3LmpzIiwid2VicGFjazovL3NwYS1zdG9yeS1tYXAvLi9zcmMvdmlld3MvbWFwVmlldy5qcyIsIndlYnBhY2s6Ly9zcGEtc3RvcnktbWFwLy4vc3JjL3ZpZXdzL2FkZHN0b3J5Vmlldy5qcyIsIndlYnBhY2s6Ly9zcGEtc3RvcnktbWFwLy4vc3JjL3ZpZXdzL2Zhdm9yaXRlc1ZpZXcuanMiLCJ3ZWJwYWNrOi8vc3BhLXN0b3J5LW1hcC8uL3NyYy92aWV3cy9sb2dpbi1wYWdlLmpzIiwid2VicGFjazovL3NwYS1zdG9yeS1tYXAvLi9zcmMvdmlld3MvcmVnaXN0ZXItcGFnZS5qcyIsIndlYnBhY2s6Ly9zcGEtc3RvcnktbWFwLy4vc3JjL3JvdXRlci5qcyIsIndlYnBhY2s6Ly9zcGEtc3RvcnktbWFwLy4vc3JjL21haW4uanMiXSwic291cmNlc0NvbnRlbnQiOlsiY29uc3QgaW5zdGFuY2VPZkFueSA9IChvYmplY3QsIGNvbnN0cnVjdG9ycykgPT4gY29uc3RydWN0b3JzLnNvbWUoKGMpID0+IG9iamVjdCBpbnN0YW5jZW9mIGMpO1xuXG5sZXQgaWRiUHJveHlhYmxlVHlwZXM7XG5sZXQgY3Vyc29yQWR2YW5jZU1ldGhvZHM7XG4vLyBUaGlzIGlzIGEgZnVuY3Rpb24gdG8gcHJldmVudCBpdCB0aHJvd2luZyB1cCBpbiBub2RlIGVudmlyb25tZW50cy5cbmZ1bmN0aW9uIGdldElkYlByb3h5YWJsZVR5cGVzKCkge1xuICAgIHJldHVybiAoaWRiUHJveHlhYmxlVHlwZXMgfHxcbiAgICAgICAgKGlkYlByb3h5YWJsZVR5cGVzID0gW1xuICAgICAgICAgICAgSURCRGF0YWJhc2UsXG4gICAgICAgICAgICBJREJPYmplY3RTdG9yZSxcbiAgICAgICAgICAgIElEQkluZGV4LFxuICAgICAgICAgICAgSURCQ3Vyc29yLFxuICAgICAgICAgICAgSURCVHJhbnNhY3Rpb24sXG4gICAgICAgIF0pKTtcbn1cbi8vIFRoaXMgaXMgYSBmdW5jdGlvbiB0byBwcmV2ZW50IGl0IHRocm93aW5nIHVwIGluIG5vZGUgZW52aXJvbm1lbnRzLlxuZnVuY3Rpb24gZ2V0Q3Vyc29yQWR2YW5jZU1ldGhvZHMoKSB7XG4gICAgcmV0dXJuIChjdXJzb3JBZHZhbmNlTWV0aG9kcyB8fFxuICAgICAgICAoY3Vyc29yQWR2YW5jZU1ldGhvZHMgPSBbXG4gICAgICAgICAgICBJREJDdXJzb3IucHJvdG90eXBlLmFkdmFuY2UsXG4gICAgICAgICAgICBJREJDdXJzb3IucHJvdG90eXBlLmNvbnRpbnVlLFxuICAgICAgICAgICAgSURCQ3Vyc29yLnByb3RvdHlwZS5jb250aW51ZVByaW1hcnlLZXksXG4gICAgICAgIF0pKTtcbn1cbmNvbnN0IGN1cnNvclJlcXVlc3RNYXAgPSBuZXcgV2Vha01hcCgpO1xuY29uc3QgdHJhbnNhY3Rpb25Eb25lTWFwID0gbmV3IFdlYWtNYXAoKTtcbmNvbnN0IHRyYW5zYWN0aW9uU3RvcmVOYW1lc01hcCA9IG5ldyBXZWFrTWFwKCk7XG5jb25zdCB0cmFuc2Zvcm1DYWNoZSA9IG5ldyBXZWFrTWFwKCk7XG5jb25zdCByZXZlcnNlVHJhbnNmb3JtQ2FjaGUgPSBuZXcgV2Vha01hcCgpO1xuZnVuY3Rpb24gcHJvbWlzaWZ5UmVxdWVzdChyZXF1ZXN0KSB7XG4gICAgY29uc3QgcHJvbWlzZSA9IG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcbiAgICAgICAgY29uc3QgdW5saXN0ZW4gPSAoKSA9PiB7XG4gICAgICAgICAgICByZXF1ZXN0LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ3N1Y2Nlc3MnLCBzdWNjZXNzKTtcbiAgICAgICAgICAgIHJlcXVlc3QucmVtb3ZlRXZlbnRMaXN0ZW5lcignZXJyb3InLCBlcnJvcik7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IHN1Y2Nlc3MgPSAoKSA9PiB7XG4gICAgICAgICAgICByZXNvbHZlKHdyYXAocmVxdWVzdC5yZXN1bHQpKTtcbiAgICAgICAgICAgIHVubGlzdGVuKCk7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGVycm9yID0gKCkgPT4ge1xuICAgICAgICAgICAgcmVqZWN0KHJlcXVlc3QuZXJyb3IpO1xuICAgICAgICAgICAgdW5saXN0ZW4oKTtcbiAgICAgICAgfTtcbiAgICAgICAgcmVxdWVzdC5hZGRFdmVudExpc3RlbmVyKCdzdWNjZXNzJywgc3VjY2Vzcyk7XG4gICAgICAgIHJlcXVlc3QuYWRkRXZlbnRMaXN0ZW5lcignZXJyb3InLCBlcnJvcik7XG4gICAgfSk7XG4gICAgcHJvbWlzZVxuICAgICAgICAudGhlbigodmFsdWUpID0+IHtcbiAgICAgICAgLy8gU2luY2UgY3Vyc29yaW5nIHJldXNlcyB0aGUgSURCUmVxdWVzdCAoKnNpZ2gqKSwgd2UgY2FjaGUgaXQgZm9yIGxhdGVyIHJldHJpZXZhbFxuICAgICAgICAvLyAoc2VlIHdyYXBGdW5jdGlvbikuXG4gICAgICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIElEQkN1cnNvcikge1xuICAgICAgICAgICAgY3Vyc29yUmVxdWVzdE1hcC5zZXQodmFsdWUsIHJlcXVlc3QpO1xuICAgICAgICB9XG4gICAgICAgIC8vIENhdGNoaW5nIHRvIGF2b2lkIFwiVW5jYXVnaHQgUHJvbWlzZSBleGNlcHRpb25zXCJcbiAgICB9KVxuICAgICAgICAuY2F0Y2goKCkgPT4geyB9KTtcbiAgICAvLyBUaGlzIG1hcHBpbmcgZXhpc3RzIGluIHJldmVyc2VUcmFuc2Zvcm1DYWNoZSBidXQgZG9lc24ndCBkb2Vzbid0IGV4aXN0IGluIHRyYW5zZm9ybUNhY2hlLiBUaGlzXG4gICAgLy8gaXMgYmVjYXVzZSB3ZSBjcmVhdGUgbWFueSBwcm9taXNlcyBmcm9tIGEgc2luZ2xlIElEQlJlcXVlc3QuXG4gICAgcmV2ZXJzZVRyYW5zZm9ybUNhY2hlLnNldChwcm9taXNlLCByZXF1ZXN0KTtcbiAgICByZXR1cm4gcHJvbWlzZTtcbn1cbmZ1bmN0aW9uIGNhY2hlRG9uZVByb21pc2VGb3JUcmFuc2FjdGlvbih0eCkge1xuICAgIC8vIEVhcmx5IGJhaWwgaWYgd2UndmUgYWxyZWFkeSBjcmVhdGVkIGEgZG9uZSBwcm9taXNlIGZvciB0aGlzIHRyYW5zYWN0aW9uLlxuICAgIGlmICh0cmFuc2FjdGlvbkRvbmVNYXAuaGFzKHR4KSlcbiAgICAgICAgcmV0dXJuO1xuICAgIGNvbnN0IGRvbmUgPSBuZXcgUHJvbWlzZSgocmVzb2x2ZSwgcmVqZWN0KSA9PiB7XG4gICAgICAgIGNvbnN0IHVubGlzdGVuID0gKCkgPT4ge1xuICAgICAgICAgICAgdHgucmVtb3ZlRXZlbnRMaXN0ZW5lcignY29tcGxldGUnLCBjb21wbGV0ZSk7XG4gICAgICAgICAgICB0eC5yZW1vdmVFdmVudExpc3RlbmVyKCdlcnJvcicsIGVycm9yKTtcbiAgICAgICAgICAgIHR4LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2Fib3J0JywgZXJyb3IpO1xuICAgICAgICB9O1xuICAgICAgICBjb25zdCBjb21wbGV0ZSA9ICgpID0+IHtcbiAgICAgICAgICAgIHJlc29sdmUoKTtcbiAgICAgICAgICAgIHVubGlzdGVuKCk7XG4gICAgICAgIH07XG4gICAgICAgIGNvbnN0IGVycm9yID0gKCkgPT4ge1xuICAgICAgICAgICAgcmVqZWN0KHR4LmVycm9yIHx8IG5ldyBET01FeGNlcHRpb24oJ0Fib3J0RXJyb3InLCAnQWJvcnRFcnJvcicpKTtcbiAgICAgICAgICAgIHVubGlzdGVuKCk7XG4gICAgICAgIH07XG4gICAgICAgIHR4LmFkZEV2ZW50TGlzdGVuZXIoJ2NvbXBsZXRlJywgY29tcGxldGUpO1xuICAgICAgICB0eC5hZGRFdmVudExpc3RlbmVyKCdlcnJvcicsIGVycm9yKTtcbiAgICAgICAgdHguYWRkRXZlbnRMaXN0ZW5lcignYWJvcnQnLCBlcnJvcik7XG4gICAgfSk7XG4gICAgLy8gQ2FjaGUgaXQgZm9yIGxhdGVyIHJldHJpZXZhbC5cbiAgICB0cmFuc2FjdGlvbkRvbmVNYXAuc2V0KHR4LCBkb25lKTtcbn1cbmxldCBpZGJQcm94eVRyYXBzID0ge1xuICAgIGdldCh0YXJnZXQsIHByb3AsIHJlY2VpdmVyKSB7XG4gICAgICAgIGlmICh0YXJnZXQgaW5zdGFuY2VvZiBJREJUcmFuc2FjdGlvbikge1xuICAgICAgICAgICAgLy8gU3BlY2lhbCBoYW5kbGluZyBmb3IgdHJhbnNhY3Rpb24uZG9uZS5cbiAgICAgICAgICAgIGlmIChwcm9wID09PSAnZG9uZScpXG4gICAgICAgICAgICAgICAgcmV0dXJuIHRyYW5zYWN0aW9uRG9uZU1hcC5nZXQodGFyZ2V0KTtcbiAgICAgICAgICAgIC8vIFBvbHlmaWxsIGZvciBvYmplY3RTdG9yZU5hbWVzIGJlY2F1c2Ugb2YgRWRnZS5cbiAgICAgICAgICAgIGlmIChwcm9wID09PSAnb2JqZWN0U3RvcmVOYW1lcycpIHtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGFyZ2V0Lm9iamVjdFN0b3JlTmFtZXMgfHwgdHJhbnNhY3Rpb25TdG9yZU5hbWVzTWFwLmdldCh0YXJnZXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgLy8gTWFrZSB0eC5zdG9yZSByZXR1cm4gdGhlIG9ubHkgc3RvcmUgaW4gdGhlIHRyYW5zYWN0aW9uLCBvciB1bmRlZmluZWQgaWYgdGhlcmUgYXJlIG1hbnkuXG4gICAgICAgICAgICBpZiAocHJvcCA9PT0gJ3N0b3JlJykge1xuICAgICAgICAgICAgICAgIHJldHVybiByZWNlaXZlci5vYmplY3RTdG9yZU5hbWVzWzFdXG4gICAgICAgICAgICAgICAgICAgID8gdW5kZWZpbmVkXG4gICAgICAgICAgICAgICAgICAgIDogcmVjZWl2ZXIub2JqZWN0U3RvcmUocmVjZWl2ZXIub2JqZWN0U3RvcmVOYW1lc1swXSk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgICAgLy8gRWxzZSB0cmFuc2Zvcm0gd2hhdGV2ZXIgd2UgZ2V0IGJhY2suXG4gICAgICAgIHJldHVybiB3cmFwKHRhcmdldFtwcm9wXSk7XG4gICAgfSxcbiAgICBzZXQodGFyZ2V0LCBwcm9wLCB2YWx1ZSkge1xuICAgICAgICB0YXJnZXRbcHJvcF0gPSB2YWx1ZTtcbiAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSxcbiAgICBoYXModGFyZ2V0LCBwcm9wKSB7XG4gICAgICAgIGlmICh0YXJnZXQgaW5zdGFuY2VvZiBJREJUcmFuc2FjdGlvbiAmJlxuICAgICAgICAgICAgKHByb3AgPT09ICdkb25lJyB8fCBwcm9wID09PSAnc3RvcmUnKSkge1xuICAgICAgICAgICAgcmV0dXJuIHRydWU7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHByb3AgaW4gdGFyZ2V0O1xuICAgIH0sXG59O1xuZnVuY3Rpb24gcmVwbGFjZVRyYXBzKGNhbGxiYWNrKSB7XG4gICAgaWRiUHJveHlUcmFwcyA9IGNhbGxiYWNrKGlkYlByb3h5VHJhcHMpO1xufVxuZnVuY3Rpb24gd3JhcEZ1bmN0aW9uKGZ1bmMpIHtcbiAgICAvLyBEdWUgdG8gZXhwZWN0ZWQgb2JqZWN0IGVxdWFsaXR5ICh3aGljaCBpcyBlbmZvcmNlZCBieSB0aGUgY2FjaGluZyBpbiBgd3JhcGApLCB3ZVxuICAgIC8vIG9ubHkgY3JlYXRlIG9uZSBuZXcgZnVuYyBwZXIgZnVuYy5cbiAgICAvLyBFZGdlIGRvZXNuJ3Qgc3VwcG9ydCBvYmplY3RTdG9yZU5hbWVzIChib29vKSwgc28gd2UgcG9seWZpbGwgaXQgaGVyZS5cbiAgICBpZiAoZnVuYyA9PT0gSURCRGF0YWJhc2UucHJvdG90eXBlLnRyYW5zYWN0aW9uICYmXG4gICAgICAgICEoJ29iamVjdFN0b3JlTmFtZXMnIGluIElEQlRyYW5zYWN0aW9uLnByb3RvdHlwZSkpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uIChzdG9yZU5hbWVzLCAuLi5hcmdzKSB7XG4gICAgICAgICAgICBjb25zdCB0eCA9IGZ1bmMuY2FsbCh1bndyYXAodGhpcyksIHN0b3JlTmFtZXMsIC4uLmFyZ3MpO1xuICAgICAgICAgICAgdHJhbnNhY3Rpb25TdG9yZU5hbWVzTWFwLnNldCh0eCwgc3RvcmVOYW1lcy5zb3J0ID8gc3RvcmVOYW1lcy5zb3J0KCkgOiBbc3RvcmVOYW1lc10pO1xuICAgICAgICAgICAgcmV0dXJuIHdyYXAodHgpO1xuICAgICAgICB9O1xuICAgIH1cbiAgICAvLyBDdXJzb3IgbWV0aG9kcyBhcmUgc3BlY2lhbCwgYXMgdGhlIGJlaGF2aW91ciBpcyBhIGxpdHRsZSBtb3JlIGRpZmZlcmVudCB0byBzdGFuZGFyZCBJREIuIEluXG4gICAgLy8gSURCLCB5b3UgYWR2YW5jZSB0aGUgY3Vyc29yIGFuZCB3YWl0IGZvciBhIG5ldyAnc3VjY2Vzcycgb24gdGhlIElEQlJlcXVlc3QgdGhhdCBnYXZlIHlvdSB0aGVcbiAgICAvLyBjdXJzb3IuIEl0J3Mga2luZGEgbGlrZSBhIHByb21pc2UgdGhhdCBjYW4gcmVzb2x2ZSB3aXRoIG1hbnkgdmFsdWVzLiBUaGF0IGRvZXNuJ3QgbWFrZSBzZW5zZVxuICAgIC8vIHdpdGggcmVhbCBwcm9taXNlcywgc28gZWFjaCBhZHZhbmNlIG1ldGhvZHMgcmV0dXJucyBhIG5ldyBwcm9taXNlIGZvciB0aGUgY3Vyc29yIG9iamVjdCwgb3JcbiAgICAvLyB1bmRlZmluZWQgaWYgdGhlIGVuZCBvZiB0aGUgY3Vyc29yIGhhcyBiZWVuIHJlYWNoZWQuXG4gICAgaWYgKGdldEN1cnNvckFkdmFuY2VNZXRob2RzKCkuaW5jbHVkZXMoZnVuYykpIHtcbiAgICAgICAgcmV0dXJuIGZ1bmN0aW9uICguLi5hcmdzKSB7XG4gICAgICAgICAgICAvLyBDYWxsaW5nIHRoZSBvcmlnaW5hbCBmdW5jdGlvbiB3aXRoIHRoZSBwcm94eSBhcyAndGhpcycgY2F1c2VzIElMTEVHQUwgSU5WT0NBVElPTiwgc28gd2UgdXNlXG4gICAgICAgICAgICAvLyB0aGUgb3JpZ2luYWwgb2JqZWN0LlxuICAgICAgICAgICAgZnVuYy5hcHBseSh1bndyYXAodGhpcyksIGFyZ3MpO1xuICAgICAgICAgICAgcmV0dXJuIHdyYXAoY3Vyc29yUmVxdWVzdE1hcC5nZXQodGhpcykpO1xuICAgICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gZnVuY3Rpb24gKC4uLmFyZ3MpIHtcbiAgICAgICAgLy8gQ2FsbGluZyB0aGUgb3JpZ2luYWwgZnVuY3Rpb24gd2l0aCB0aGUgcHJveHkgYXMgJ3RoaXMnIGNhdXNlcyBJTExFR0FMIElOVk9DQVRJT04sIHNvIHdlIHVzZVxuICAgICAgICAvLyB0aGUgb3JpZ2luYWwgb2JqZWN0LlxuICAgICAgICByZXR1cm4gd3JhcChmdW5jLmFwcGx5KHVud3JhcCh0aGlzKSwgYXJncykpO1xuICAgIH07XG59XG5mdW5jdGlvbiB0cmFuc2Zvcm1DYWNoYWJsZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Z1bmN0aW9uJylcbiAgICAgICAgcmV0dXJuIHdyYXBGdW5jdGlvbih2YWx1ZSk7XG4gICAgLy8gVGhpcyBkb2Vzbid0IHJldHVybiwgaXQganVzdCBjcmVhdGVzIGEgJ2RvbmUnIHByb21pc2UgZm9yIHRoZSB0cmFuc2FjdGlvbixcbiAgICAvLyB3aGljaCBpcyBsYXRlciByZXR1cm5lZCBmb3IgdHJhbnNhY3Rpb24uZG9uZSAoc2VlIGlkYk9iamVjdEhhbmRsZXIpLlxuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIElEQlRyYW5zYWN0aW9uKVxuICAgICAgICBjYWNoZURvbmVQcm9taXNlRm9yVHJhbnNhY3Rpb24odmFsdWUpO1xuICAgIGlmIChpbnN0YW5jZU9mQW55KHZhbHVlLCBnZXRJZGJQcm94eWFibGVUeXBlcygpKSlcbiAgICAgICAgcmV0dXJuIG5ldyBQcm94eSh2YWx1ZSwgaWRiUHJveHlUcmFwcyk7XG4gICAgLy8gUmV0dXJuIHRoZSBzYW1lIHZhbHVlIGJhY2sgaWYgd2UncmUgbm90IGdvaW5nIHRvIHRyYW5zZm9ybSBpdC5cbiAgICByZXR1cm4gdmFsdWU7XG59XG5mdW5jdGlvbiB3cmFwKHZhbHVlKSB7XG4gICAgLy8gV2Ugc29tZXRpbWVzIGdlbmVyYXRlIG11bHRpcGxlIHByb21pc2VzIGZyb20gYSBzaW5nbGUgSURCUmVxdWVzdCAoZWcgd2hlbiBjdXJzb3JpbmcpLCBiZWNhdXNlXG4gICAgLy8gSURCIGlzIHdlaXJkIGFuZCBhIHNpbmdsZSBJREJSZXF1ZXN0IGNhbiB5aWVsZCBtYW55IHJlc3BvbnNlcywgc28gdGhlc2UgY2FuJ3QgYmUgY2FjaGVkLlxuICAgIGlmICh2YWx1ZSBpbnN0YW5jZW9mIElEQlJlcXVlc3QpXG4gICAgICAgIHJldHVybiBwcm9taXNpZnlSZXF1ZXN0KHZhbHVlKTtcbiAgICAvLyBJZiB3ZSd2ZSBhbHJlYWR5IHRyYW5zZm9ybWVkIHRoaXMgdmFsdWUgYmVmb3JlLCByZXVzZSB0aGUgdHJhbnNmb3JtZWQgdmFsdWUuXG4gICAgLy8gVGhpcyBpcyBmYXN0ZXIsIGJ1dCBpdCBhbHNvIHByb3ZpZGVzIG9iamVjdCBlcXVhbGl0eS5cbiAgICBpZiAodHJhbnNmb3JtQ2FjaGUuaGFzKHZhbHVlKSlcbiAgICAgICAgcmV0dXJuIHRyYW5zZm9ybUNhY2hlLmdldCh2YWx1ZSk7XG4gICAgY29uc3QgbmV3VmFsdWUgPSB0cmFuc2Zvcm1DYWNoYWJsZVZhbHVlKHZhbHVlKTtcbiAgICAvLyBOb3QgYWxsIHR5cGVzIGFyZSB0cmFuc2Zvcm1lZC5cbiAgICAvLyBUaGVzZSBtYXkgYmUgcHJpbWl0aXZlIHR5cGVzLCBzbyB0aGV5IGNhbid0IGJlIFdlYWtNYXAga2V5cy5cbiAgICBpZiAobmV3VmFsdWUgIT09IHZhbHVlKSB7XG4gICAgICAgIHRyYW5zZm9ybUNhY2hlLnNldCh2YWx1ZSwgbmV3VmFsdWUpO1xuICAgICAgICByZXZlcnNlVHJhbnNmb3JtQ2FjaGUuc2V0KG5ld1ZhbHVlLCB2YWx1ZSk7XG4gICAgfVxuICAgIHJldHVybiBuZXdWYWx1ZTtcbn1cbmNvbnN0IHVud3JhcCA9ICh2YWx1ZSkgPT4gcmV2ZXJzZVRyYW5zZm9ybUNhY2hlLmdldCh2YWx1ZSk7XG5cbmV4cG9ydCB7IHJldmVyc2VUcmFuc2Zvcm1DYWNoZSBhcyBhLCBpbnN0YW5jZU9mQW55IGFzIGksIHJlcGxhY2VUcmFwcyBhcyByLCB1bndyYXAgYXMgdSwgd3JhcCBhcyB3IH07XG4iLCJpbXBvcnQgeyB3IGFzIHdyYXAsIHIgYXMgcmVwbGFjZVRyYXBzIH0gZnJvbSAnLi93cmFwLWlkYi12YWx1ZS5qcyc7XG5leHBvcnQgeyB1IGFzIHVud3JhcCwgdyBhcyB3cmFwIH0gZnJvbSAnLi93cmFwLWlkYi12YWx1ZS5qcyc7XG5cbi8qKlxuICogT3BlbiBhIGRhdGFiYXNlLlxuICpcbiAqIEBwYXJhbSBuYW1lIE5hbWUgb2YgdGhlIGRhdGFiYXNlLlxuICogQHBhcmFtIHZlcnNpb24gU2NoZW1hIHZlcnNpb24uXG4gKiBAcGFyYW0gY2FsbGJhY2tzIEFkZGl0aW9uYWwgY2FsbGJhY2tzLlxuICovXG5mdW5jdGlvbiBvcGVuREIobmFtZSwgdmVyc2lvbiwgeyBibG9ja2VkLCB1cGdyYWRlLCBibG9ja2luZywgdGVybWluYXRlZCB9ID0ge30pIHtcbiAgICBjb25zdCByZXF1ZXN0ID0gaW5kZXhlZERCLm9wZW4obmFtZSwgdmVyc2lvbik7XG4gICAgY29uc3Qgb3BlblByb21pc2UgPSB3cmFwKHJlcXVlc3QpO1xuICAgIGlmICh1cGdyYWRlKSB7XG4gICAgICAgIHJlcXVlc3QuYWRkRXZlbnRMaXN0ZW5lcigndXBncmFkZW5lZWRlZCcsIChldmVudCkgPT4ge1xuICAgICAgICAgICAgdXBncmFkZSh3cmFwKHJlcXVlc3QucmVzdWx0KSwgZXZlbnQub2xkVmVyc2lvbiwgZXZlbnQubmV3VmVyc2lvbiwgd3JhcChyZXF1ZXN0LnRyYW5zYWN0aW9uKSwgZXZlbnQpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgaWYgKGJsb2NrZWQpIHtcbiAgICAgICAgcmVxdWVzdC5hZGRFdmVudExpc3RlbmVyKCdibG9ja2VkJywgKGV2ZW50KSA9PiBibG9ja2VkKFxuICAgICAgICAvLyBDYXN0aW5nIGR1ZSB0byBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L1R5cGVTY3JpcHQtRE9NLWxpYi1nZW5lcmF0b3IvcHVsbC8xNDA1XG4gICAgICAgIGV2ZW50Lm9sZFZlcnNpb24sIGV2ZW50Lm5ld1ZlcnNpb24sIGV2ZW50KSk7XG4gICAgfVxuICAgIG9wZW5Qcm9taXNlXG4gICAgICAgIC50aGVuKChkYikgPT4ge1xuICAgICAgICBpZiAodGVybWluYXRlZClcbiAgICAgICAgICAgIGRiLmFkZEV2ZW50TGlzdGVuZXIoJ2Nsb3NlJywgKCkgPT4gdGVybWluYXRlZCgpKTtcbiAgICAgICAgaWYgKGJsb2NraW5nKSB7XG4gICAgICAgICAgICBkYi5hZGRFdmVudExpc3RlbmVyKCd2ZXJzaW9uY2hhbmdlJywgKGV2ZW50KSA9PiBibG9ja2luZyhldmVudC5vbGRWZXJzaW9uLCBldmVudC5uZXdWZXJzaW9uLCBldmVudCkpO1xuICAgICAgICB9XG4gICAgfSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHsgfSk7XG4gICAgcmV0dXJuIG9wZW5Qcm9taXNlO1xufVxuLyoqXG4gKiBEZWxldGUgYSBkYXRhYmFzZS5cbiAqXG4gKiBAcGFyYW0gbmFtZSBOYW1lIG9mIHRoZSBkYXRhYmFzZS5cbiAqL1xuZnVuY3Rpb24gZGVsZXRlREIobmFtZSwgeyBibG9ja2VkIH0gPSB7fSkge1xuICAgIGNvbnN0IHJlcXVlc3QgPSBpbmRleGVkREIuZGVsZXRlRGF0YWJhc2UobmFtZSk7XG4gICAgaWYgKGJsb2NrZWQpIHtcbiAgICAgICAgcmVxdWVzdC5hZGRFdmVudExpc3RlbmVyKCdibG9ja2VkJywgKGV2ZW50KSA9PiBibG9ja2VkKFxuICAgICAgICAvLyBDYXN0aW5nIGR1ZSB0byBodHRwczovL2dpdGh1Yi5jb20vbWljcm9zb2Z0L1R5cGVTY3JpcHQtRE9NLWxpYi1nZW5lcmF0b3IvcHVsbC8xNDA1XG4gICAgICAgIGV2ZW50Lm9sZFZlcnNpb24sIGV2ZW50KSk7XG4gICAgfVxuICAgIHJldHVybiB3cmFwKHJlcXVlc3QpLnRoZW4oKCkgPT4gdW5kZWZpbmVkKTtcbn1cblxuY29uc3QgcmVhZE1ldGhvZHMgPSBbJ2dldCcsICdnZXRLZXknLCAnZ2V0QWxsJywgJ2dldEFsbEtleXMnLCAnY291bnQnXTtcbmNvbnN0IHdyaXRlTWV0aG9kcyA9IFsncHV0JywgJ2FkZCcsICdkZWxldGUnLCAnY2xlYXInXTtcbmNvbnN0IGNhY2hlZE1ldGhvZHMgPSBuZXcgTWFwKCk7XG5mdW5jdGlvbiBnZXRNZXRob2QodGFyZ2V0LCBwcm9wKSB7XG4gICAgaWYgKCEodGFyZ2V0IGluc3RhbmNlb2YgSURCRGF0YWJhc2UgJiZcbiAgICAgICAgIShwcm9wIGluIHRhcmdldCkgJiZcbiAgICAgICAgdHlwZW9mIHByb3AgPT09ICdzdHJpbmcnKSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIGlmIChjYWNoZWRNZXRob2RzLmdldChwcm9wKSlcbiAgICAgICAgcmV0dXJuIGNhY2hlZE1ldGhvZHMuZ2V0KHByb3ApO1xuICAgIGNvbnN0IHRhcmdldEZ1bmNOYW1lID0gcHJvcC5yZXBsYWNlKC9Gcm9tSW5kZXgkLywgJycpO1xuICAgIGNvbnN0IHVzZUluZGV4ID0gcHJvcCAhPT0gdGFyZ2V0RnVuY05hbWU7XG4gICAgY29uc3QgaXNXcml0ZSA9IHdyaXRlTWV0aG9kcy5pbmNsdWRlcyh0YXJnZXRGdW5jTmFtZSk7XG4gICAgaWYgKFxuICAgIC8vIEJhaWwgaWYgdGhlIHRhcmdldCBkb2Vzbid0IGV4aXN0IG9uIHRoZSB0YXJnZXQuIEVnLCBnZXRBbGwgaXNuJ3QgaW4gRWRnZS5cbiAgICAhKHRhcmdldEZ1bmNOYW1lIGluICh1c2VJbmRleCA/IElEQkluZGV4IDogSURCT2JqZWN0U3RvcmUpLnByb3RvdHlwZSkgfHxcbiAgICAgICAgIShpc1dyaXRlIHx8IHJlYWRNZXRob2RzLmluY2x1ZGVzKHRhcmdldEZ1bmNOYW1lKSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgIH1cbiAgICBjb25zdCBtZXRob2QgPSBhc3luYyBmdW5jdGlvbiAoc3RvcmVOYW1lLCAuLi5hcmdzKSB7XG4gICAgICAgIC8vIGlzV3JpdGUgPyAncmVhZHdyaXRlJyA6IHVuZGVmaW5lZCBnemlwcHMgYmV0dGVyLCBidXQgZmFpbHMgaW4gRWRnZSA6KFxuICAgICAgICBjb25zdCB0eCA9IHRoaXMudHJhbnNhY3Rpb24oc3RvcmVOYW1lLCBpc1dyaXRlID8gJ3JlYWR3cml0ZScgOiAncmVhZG9ubHknKTtcbiAgICAgICAgbGV0IHRhcmdldCA9IHR4LnN0b3JlO1xuICAgICAgICBpZiAodXNlSW5kZXgpXG4gICAgICAgICAgICB0YXJnZXQgPSB0YXJnZXQuaW5kZXgoYXJncy5zaGlmdCgpKTtcbiAgICAgICAgLy8gTXVzdCByZWplY3QgaWYgb3AgcmVqZWN0cy5cbiAgICAgICAgLy8gSWYgaXQncyBhIHdyaXRlIG9wZXJhdGlvbiwgbXVzdCByZWplY3QgaWYgdHguZG9uZSByZWplY3RzLlxuICAgICAgICAvLyBNdXN0IHJlamVjdCB3aXRoIG9wIHJlamVjdGlvbiBmaXJzdC5cbiAgICAgICAgLy8gTXVzdCByZXNvbHZlIHdpdGggb3AgdmFsdWUuXG4gICAgICAgIC8vIE11c3QgaGFuZGxlIGJvdGggcHJvbWlzZXMgKG5vIHVuaGFuZGxlZCByZWplY3Rpb25zKVxuICAgICAgICByZXR1cm4gKGF3YWl0IFByb21pc2UuYWxsKFtcbiAgICAgICAgICAgIHRhcmdldFt0YXJnZXRGdW5jTmFtZV0oLi4uYXJncyksXG4gICAgICAgICAgICBpc1dyaXRlICYmIHR4LmRvbmUsXG4gICAgICAgIF0pKVswXTtcbiAgICB9O1xuICAgIGNhY2hlZE1ldGhvZHMuc2V0KHByb3AsIG1ldGhvZCk7XG4gICAgcmV0dXJuIG1ldGhvZDtcbn1cbnJlcGxhY2VUcmFwcygob2xkVHJhcHMpID0+ICh7XG4gICAgLi4ub2xkVHJhcHMsXG4gICAgZ2V0OiAodGFyZ2V0LCBwcm9wLCByZWNlaXZlcikgPT4gZ2V0TWV0aG9kKHRhcmdldCwgcHJvcCkgfHwgb2xkVHJhcHMuZ2V0KHRhcmdldCwgcHJvcCwgcmVjZWl2ZXIpLFxuICAgIGhhczogKHRhcmdldCwgcHJvcCkgPT4gISFnZXRNZXRob2QodGFyZ2V0LCBwcm9wKSB8fCBvbGRUcmFwcy5oYXModGFyZ2V0LCBwcm9wKSxcbn0pKTtcblxuZXhwb3J0IHsgZGVsZXRlREIsIG9wZW5EQiB9O1xuIiwiaW1wb3J0IHsgb3BlbkRCIH0gZnJvbSBcImlkYlwiO1xyXG5cclxuY29uc3QgREJfTkFNRSA9IFwic3RvcnktZGJcIjtcclxuY29uc3QgU1RPUkVfRkFWT1JJVEVTID0gXCJmYXZvcml0ZXNcIjtcclxuY29uc3QgU1RPUkVfT0ZGTElORV9TVE9SSUVTID0gXCJvZmZsaW5lLXN0b3JpZXNcIjtcclxuXHJcbmV4cG9ydCBjb25zdCBmYXZvcml0ZURCID0ge1xyXG4gICAgYXN5bmMgaW5pdCgpIHtcclxuICAgICAgICByZXR1cm4gb3BlbkRCKERCX05BTUUsIDIsIHtcclxuICAgICAgICAgICAgdXBncmFkZShkYiwgb2xkVmVyc2lvbikge1xyXG4gICAgICAgICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKFNUT1JFX0ZBVk9SSVRFUykpIHtcclxuICAgICAgICAgICAgICAgICAgICBkYi5jcmVhdGVPYmplY3RTdG9yZShTVE9SRV9GQVZPUklURVMsIHsga2V5UGF0aDogXCJpZFwiIH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICAgICAgaWYgKCFkYi5vYmplY3RTdG9yZU5hbWVzLmNvbnRhaW5zKFNUT1JFX09GRkxJTkVfU1RPUklFUykpIHtcclxuICAgICAgICAgICAgICAgICAgICBkYi5jcmVhdGVPYmplY3RTdG9yZShTVE9SRV9PRkZMSU5FX1NUT1JJRVMsIHsga2V5UGF0aDogXCJpZFwiLCBhdXRvSW5jcmVtZW50OiB0cnVlIH0pO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9LFxyXG4gICAgICAgIH0pO1xyXG4gICAgfSxcclxuXHJcbiAgICAvLyBGYXZvcml0ZXMgQ1JVRFxyXG4gICAgYXN5bmMgYWRkRmF2b3JpdGUoc3RvcnkpIHtcclxuICAgICAgICBjb25zdCBkYiA9IGF3YWl0IHRoaXMuaW5pdCgpO1xyXG4gICAgICAgIGF3YWl0IGRiLnB1dChTVE9SRV9GQVZPUklURVMsIHN0b3J5KTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIvCfk6YgU3RvcnkgZGlzaW1wYW4ga2UgZmF2b3JpdGVzOlwiLCBzdG9yeS5uYW1lKTtcclxuICAgIH0sXHJcblxyXG4gICAgYXN5bmMgZ2V0QWxsRmF2b3JpdGVzKCkge1xyXG4gICAgICAgIGNvbnN0IGRiID0gYXdhaXQgdGhpcy5pbml0KCk7XHJcbiAgICAgICAgcmV0dXJuIGRiLmdldEFsbChTVE9SRV9GQVZPUklURVMpO1xyXG4gICAgfSxcclxuXHJcbiAgICBhc3luYyBkZWxldGVGYXZvcml0ZShpZCkge1xyXG4gICAgICAgIGNvbnN0IGRiID0gYXdhaXQgdGhpcy5pbml0KCk7XHJcbiAgICAgICAgYXdhaXQgZGIuZGVsZXRlKFNUT1JFX0ZBVk9SSVRFUywgaWQpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwi8J+Xke+4jyBTdG9yeSBkaWhhcHVzIGRhcmkgZmF2b3JpdGVzOlwiLCBpZCk7XHJcbiAgICB9LFxyXG5cclxuICAgIC8vIFNlYXJjaC9GaWx0ZXIvU29ydCBmb3IgZmF2b3JpdGVzXHJcbiAgICBhc3luYyBzZWFyY2hGYXZvcml0ZXMocXVlcnkpIHtcclxuICAgICAgICBjb25zdCBmYXZvcml0ZXMgPSBhd2FpdCB0aGlzLmdldEFsbEZhdm9yaXRlcygpO1xyXG4gICAgICAgIHJldHVybiBmYXZvcml0ZXMuZmlsdGVyKHN0b3J5ID0+XHJcbiAgICAgICAgICAgIHN0b3J5Lm5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyhxdWVyeS50b0xvd2VyQ2FzZSgpKSB8fFxyXG4gICAgICAgICAgICBzdG9yeS5kZXNjcmlwdGlvbi50b0xvd2VyQ2FzZSgpLmluY2x1ZGVzKHF1ZXJ5LnRvTG93ZXJDYXNlKCkpXHJcbiAgICAgICAgKTtcclxuICAgIH0sXHJcblxyXG4gICAgYXN5bmMgZmlsdGVyRmF2b3JpdGVzQnlEYXRlKG9yZGVyID0gJ2Rlc2MnKSB7XHJcbiAgICAgICAgY29uc3QgZmF2b3JpdGVzID0gYXdhaXQgdGhpcy5nZXRBbGxGYXZvcml0ZXMoKTtcclxuICAgICAgICByZXR1cm4gZmF2b3JpdGVzLnNvcnQoKGEsIGIpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgZGF0ZUEgPSBuZXcgRGF0ZShhLmNyZWF0ZWRBdCk7XHJcbiAgICAgICAgICAgIGNvbnN0IGRhdGVCID0gbmV3IERhdGUoYi5jcmVhdGVkQXQpO1xyXG4gICAgICAgICAgICByZXR1cm4gb3JkZXIgPT09ICdkZXNjJyA/IGRhdGVCIC0gZGF0ZUEgOiBkYXRlQSAtIGRhdGVCO1xyXG4gICAgICAgIH0pO1xyXG4gICAgfSxcclxuXHJcbiAgICBhc3luYyBzb3J0RmF2b3JpdGVzQnlOYW1lKG9yZGVyID0gJ2FzYycpIHtcclxuICAgICAgICBjb25zdCBmYXZvcml0ZXMgPSBhd2FpdCB0aGlzLmdldEFsbEZhdm9yaXRlcygpO1xyXG4gICAgICAgIHJldHVybiBmYXZvcml0ZXMuc29ydCgoYSwgYikgPT4ge1xyXG4gICAgICAgICAgICBjb25zdCBuYW1lQSA9IGEubmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBjb25zdCBuYW1lQiA9IGIubmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICBpZiAob3JkZXIgPT09ICdhc2MnKSB7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gbmFtZUEgPCBuYW1lQiA/IC0xIDogbmFtZUEgPiBuYW1lQiA/IDEgOiAwO1xyXG4gICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIG5hbWVBID4gbmFtZUIgPyAtMSA6IG5hbWVBIDwgbmFtZUIgPyAxIDogMDtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfSxcclxuXHJcbiAgICAvLyBPZmZsaW5lIFN0b3JpZXMgUXVldWVcclxuICAgIGFzeW5jIGFkZE9mZmxpbmVTdG9yeShmb3JtRGF0YSkge1xyXG4gICAgICAgIGNvbnN0IGRiID0gYXdhaXQgdGhpcy5pbml0KCk7XHJcbiAgICAgICAgY29uc3Qgc3RvcnlEYXRhID0ge1xyXG4gICAgICAgICAgICBmb3JtRGF0YTogYXdhaXQgdGhpcy5mb3JtRGF0YVRvT2JqZWN0KGZvcm1EYXRhKSxcclxuICAgICAgICAgICAgdGltZXN0YW1wOiBEYXRlLm5vdygpLFxyXG4gICAgICAgICAgICBzeW5jZWQ6IGZhbHNlLFxyXG4gICAgICAgIH07XHJcbiAgICAgICAgY29uc3QgaWQgPSBhd2FpdCBkYi5hZGQoU1RPUkVfT0ZGTElORV9TVE9SSUVTLCBzdG9yeURhdGEpO1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwi8J+TsSBTdG9yeSBvZmZsaW5lIGRpc2ltcGFuOlwiLCBpZCk7XHJcbiAgICAgICAgcmV0dXJuIGlkO1xyXG4gICAgfSxcclxuXHJcbiAgICBhc3luYyBnZXRPZmZsaW5lU3RvcmllcygpIHtcclxuICAgICAgICBjb25zdCBkYiA9IGF3YWl0IHRoaXMuaW5pdCgpO1xyXG4gICAgICAgIHJldHVybiBkYi5nZXRBbGwoU1RPUkVfT0ZGTElORV9TVE9SSUVTKTtcclxuICAgIH0sXHJcblxyXG4gICAgYXN5bmMgZGVsZXRlT2ZmbGluZVN0b3J5KGlkKSB7XHJcbiAgICAgICAgY29uc3QgZGIgPSBhd2FpdCB0aGlzLmluaXQoKTtcclxuICAgICAgICBhd2FpdCBkYi5kZWxldGUoU1RPUkVfT0ZGTElORV9TVE9SSUVTLCBpZCk7XHJcbiAgICAgICAgY29uc29sZS5sb2coXCLwn5eR77iPIE9mZmxpbmUgc3RvcnkgZGloYXB1czpcIiwgaWQpO1xyXG4gICAgfSxcclxuXHJcbiAgICBhc3luYyBtYXJrU3luY2VkKGlkKSB7XHJcbiAgICAgICAgY29uc3QgZGIgPSBhd2FpdCB0aGlzLmluaXQoKTtcclxuICAgICAgICBjb25zdCBzdG9yeSA9IGF3YWl0IGRiLmdldChTVE9SRV9PRkZMSU5FX1NUT1JJRVMsIGlkKTtcclxuICAgICAgICBpZiAoc3RvcnkpIHtcclxuICAgICAgICAgICAgc3Rvcnkuc3luY2VkID0gdHJ1ZTtcclxuICAgICAgICAgICAgYXdhaXQgZGIucHV0KFNUT1JFX09GRkxJTkVfU1RPUklFUywgc3RvcnkpO1xyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIuKchSBPZmZsaW5lIHN0b3J5IG1hcmtlZCBhcyBzeW5jZWQ6XCIsIGlkKTtcclxuICAgICAgICB9XHJcbiAgICB9LFxyXG5cclxuICAgIC8vIFN5bmMgb2ZmbGluZSBzdG9yaWVzIHdoZW4gb25saW5lXHJcbiAgICBhc3luYyBzeW5jT2ZmbGluZVN0b3JpZXMoYXBpTW9kZWwpIHtcclxuICAgICAgICBjb25zdCBvZmZsaW5lU3RvcmllcyA9IGF3YWl0IHRoaXMuZ2V0T2ZmbGluZVN0b3JpZXMoKTtcclxuICAgICAgICBjb25zdCB1bnN5bmNlZCA9IG9mZmxpbmVTdG9yaWVzLmZpbHRlcihzdG9yeSA9PiAhc3Rvcnkuc3luY2VkKTtcclxuXHJcbiAgICAgICAgZm9yIChjb25zdCBzdG9yeSBvZiB1bnN5bmNlZCkge1xyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZm9ybURhdGEgPSB0aGlzLm9iamVjdFRvRm9ybURhdGEoc3RvcnkuZm9ybURhdGEpO1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYXBpTW9kZWwuYWRkU3RvcnkoZm9ybURhdGEpO1xyXG4gICAgICAgICAgICAgICAgaWYgKCFyZXN1bHQuZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLm1hcmtTeW5jZWQoc3RvcnkuaWQpO1xyXG4gICAgICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKFwi4pyFIE9mZmxpbmUgc3Rvcnkgc3luY2VkOlwiLCBzdG9yeS5pZCk7XHJcbiAgICAgICAgICAgICAgICB9XHJcbiAgICAgICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIuKdjCBGYWlsZWQgdG8gc3luYyBvZmZsaW5lIHN0b3J5OlwiLCBzdG9yeS5pZCwgZXJyKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgIH0sXHJcblxyXG4gICAgLy8gVXRpbGl0eSBmdW5jdGlvbnNcclxuICAgIGFzeW5jIGZvcm1EYXRhVG9PYmplY3QoZm9ybURhdGEpIHtcclxuICAgICAgICBjb25zdCBvYmogPSB7fTtcclxuICAgICAgICBmb3IgKGNvbnN0IFtrZXksIHZhbHVlXSBvZiBmb3JtRGF0YS5lbnRyaWVzKCkpIHtcclxuICAgICAgICAgICAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRmlsZSkge1xyXG4gICAgICAgICAgICAgICAgLy8gQ29udmVydCBmaWxlIHRvIGJhc2U2NCBmb3Igc3RvcmFnZVxyXG4gICAgICAgICAgICAgICAgb2JqW2tleV0gPSB7XHJcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogdmFsdWUubmFtZSxcclxuICAgICAgICAgICAgICAgICAgICB0eXBlOiB2YWx1ZS50eXBlLFxyXG4gICAgICAgICAgICAgICAgICAgIHNpemU6IHZhbHVlLnNpemUsXHJcbiAgICAgICAgICAgICAgICAgICAgZGF0YTogYXdhaXQgdGhpcy5maWxlVG9CYXNlNjQodmFsdWUpLFxyXG4gICAgICAgICAgICAgICAgfTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIG9ialtrZXldID0gdmFsdWU7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG9iajtcclxuICAgIH0sXHJcblxyXG4gICAgb2JqZWN0VG9Gb3JtRGF0YShvYmopIHtcclxuICAgICAgICBjb25zdCBmb3JtRGF0YSA9IG5ldyBGb3JtRGF0YSgpO1xyXG4gICAgICAgIGZvciAoY29uc3QgW2tleSwgdmFsdWVdIG9mIE9iamVjdC5lbnRyaWVzKG9iaikpIHtcclxuICAgICAgICAgICAgaWYgKHZhbHVlICYmIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuZGF0YSkge1xyXG4gICAgICAgICAgICAgICAgLy8gQ29udmVydCBiYXNlNjQgYmFjayB0byBmaWxlXHJcbiAgICAgICAgICAgICAgICBjb25zdCBmaWxlID0gdGhpcy5iYXNlNjRUb0ZpbGUodmFsdWUuZGF0YSwgdmFsdWUubmFtZSwgdmFsdWUudHlwZSk7XHJcbiAgICAgICAgICAgICAgICBmb3JtRGF0YS5hcHBlbmQoa2V5LCBmaWxlKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGZvcm1EYXRhLmFwcGVuZChrZXksIHZhbHVlKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH1cclxuICAgICAgICByZXR1cm4gZm9ybURhdGE7XHJcbiAgICB9LFxyXG5cclxuICAgIGFzeW5jIGZpbGVUb0Jhc2U2NChmaWxlKSB7XHJcbiAgICAgICAgcmV0dXJuIG5ldyBQcm9taXNlKChyZXNvbHZlLCByZWplY3QpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgcmVhZGVyID0gbmV3IEZpbGVSZWFkZXIoKTtcclxuICAgICAgICAgICAgcmVhZGVyLm9ubG9hZCA9ICgpID0+IHJlc29sdmUocmVhZGVyLnJlc3VsdCk7XHJcbiAgICAgICAgICAgIHJlYWRlci5vbmVycm9yID0gcmVqZWN0O1xyXG4gICAgICAgICAgICByZWFkZXIucmVhZEFzRGF0YVVSTChmaWxlKTtcclxuICAgICAgICB9KTtcclxuICAgIH0sXHJcblxyXG4gICAgYmFzZTY0VG9GaWxlKGJhc2U2NCwgZmlsZW5hbWUsIG1pbWVUeXBlKSB7XHJcbiAgICAgICAgY29uc3QgYXJyID0gYmFzZTY0LnNwbGl0KCcsJyk7XHJcbiAgICAgICAgY29uc3QgYnN0ciA9IGF0b2IoYXJyWzFdKTtcclxuICAgICAgICBsZXQgbiA9IGJzdHIubGVuZ3RoO1xyXG4gICAgICAgIGNvbnN0IHU4YXJyID0gbmV3IFVpbnQ4QXJyYXkobik7XHJcbiAgICAgICAgd2hpbGUgKG4tLSkge1xyXG4gICAgICAgICAgICB1OGFycltuXSA9IGJzdHIuY2hhckNvZGVBdChuKTtcclxuICAgICAgICB9XHJcbiAgICAgICAgcmV0dXJuIG5ldyBGaWxlKFt1OGFycl0sIGZpbGVuYW1lLCB7IHR5cGU6IG1pbWVUeXBlIH0pO1xyXG4gICAgfSxcclxufTtcclxuIiwiLy8gVGhlIG1vZHVsZSBjYWNoZVxudmFyIF9fd2VicGFja19tb2R1bGVfY2FjaGVfXyA9IHt9O1xuXG4vLyBUaGUgcmVxdWlyZSBmdW5jdGlvblxuZnVuY3Rpb24gX193ZWJwYWNrX3JlcXVpcmVfXyhtb2R1bGVJZCkge1xuXHQvLyBDaGVjayBpZiBtb2R1bGUgaXMgaW4gY2FjaGVcblx0dmFyIGNhY2hlZE1vZHVsZSA9IF9fd2VicGFja19tb2R1bGVfY2FjaGVfX1ttb2R1bGVJZF07XG5cdGlmIChjYWNoZWRNb2R1bGUgIT09IHVuZGVmaW5lZCkge1xuXHRcdHJldHVybiBjYWNoZWRNb2R1bGUuZXhwb3J0cztcblx0fVxuXHQvLyBDcmVhdGUgYSBuZXcgbW9kdWxlIChhbmQgcHV0IGl0IGludG8gdGhlIGNhY2hlKVxuXHR2YXIgbW9kdWxlID0gX193ZWJwYWNrX21vZHVsZV9jYWNoZV9fW21vZHVsZUlkXSA9IHtcblx0XHQvLyBubyBtb2R1bGUuaWQgbmVlZGVkXG5cdFx0Ly8gbm8gbW9kdWxlLmxvYWRlZCBuZWVkZWRcblx0XHRleHBvcnRzOiB7fVxuXHR9O1xuXG5cdC8vIEV4ZWN1dGUgdGhlIG1vZHVsZSBmdW5jdGlvblxuXHRfX3dlYnBhY2tfbW9kdWxlc19fW21vZHVsZUlkXShtb2R1bGUsIG1vZHVsZS5leHBvcnRzLCBfX3dlYnBhY2tfcmVxdWlyZV9fKTtcblxuXHQvLyBSZXR1cm4gdGhlIGV4cG9ydHMgb2YgdGhlIG1vZHVsZVxuXHRyZXR1cm4gbW9kdWxlLmV4cG9ydHM7XG59XG5cbiIsIi8vIGRlZmluZSBnZXR0ZXIgZnVuY3Rpb25zIGZvciBoYXJtb255IGV4cG9ydHNcbl9fd2VicGFja19yZXF1aXJlX18uZCA9IChleHBvcnRzLCBkZWZpbml0aW9uKSA9PiB7XG5cdGZvcih2YXIga2V5IGluIGRlZmluaXRpb24pIHtcblx0XHRpZihfX3dlYnBhY2tfcmVxdWlyZV9fLm8oZGVmaW5pdGlvbiwga2V5KSAmJiAhX193ZWJwYWNrX3JlcXVpcmVfXy5vKGV4cG9ydHMsIGtleSkpIHtcblx0XHRcdE9iamVjdC5kZWZpbmVQcm9wZXJ0eShleHBvcnRzLCBrZXksIHsgZW51bWVyYWJsZTogdHJ1ZSwgZ2V0OiBkZWZpbml0aW9uW2tleV0gfSk7XG5cdFx0fVxuXHR9XG59OyIsIl9fd2VicGFja19yZXF1aXJlX18ubyA9IChvYmosIHByb3ApID0+IChPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwob2JqLCBwcm9wKSkiLCIvLyBkZWZpbmUgX19lc01vZHVsZSBvbiBleHBvcnRzXG5fX3dlYnBhY2tfcmVxdWlyZV9fLnIgPSAoZXhwb3J0cykgPT4ge1xuXHRpZih0eXBlb2YgU3ltYm9sICE9PSAndW5kZWZpbmVkJyAmJiBTeW1ib2wudG9TdHJpbmdUYWcpIHtcblx0XHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgU3ltYm9sLnRvU3RyaW5nVGFnLCB7IHZhbHVlOiAnTW9kdWxlJyB9KTtcblx0fVxuXHRPYmplY3QuZGVmaW5lUHJvcGVydHkoZXhwb3J0cywgJ19fZXNNb2R1bGUnLCB7IHZhbHVlOiB0cnVlIH0pO1xufTsiLCJleHBvcnQgY2xhc3MgUGFnZVByZXNlbnRlciB7XHJcbiAgICBjb25zdHJ1Y3Rvcih2aWV3KSB7XHJcbiAgICAgICAgdGhpcy52aWV3ID0gdmlldztcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBnZXRWaWV3KCkge1xyXG4gICAgICAgIC8vIFJlbmRlciBlbGVtZW4gdGFtcGlsYW5cclxuICAgICAgICBjb25zdCB2aWV3RWxlbWVudCA9IGF3YWl0IHRoaXMudmlldy5yZW5kZXIoKTtcclxuXHJcbiAgICAgICAgLy8gSmFsYW5rYW4gYWZ0ZXJSZW5kZXIoKSBzZXRlbGFoIGVsZW1lbiBzdWRhaCBhZGEgZGkgRE9NXHJcbiAgICAgICAgLy8gKHJvdXRlciBha2FuIGFwcGVuZENoaWxkLW55YSBsZWJpaCBkdWx1KVxyXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4ge1xyXG4gICAgICAgICAgICBpZiAodHlwZW9mIHRoaXMudmlldy5hZnRlclJlbmRlciA9PT0gXCJmdW5jdGlvblwiKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnZpZXcuYWZ0ZXJSZW5kZXIoKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0sIDApO1xyXG5cclxuICAgICAgICByZXR1cm4gdmlld0VsZW1lbnQ7XHJcbiAgICB9XHJcbn1cclxuIiwiZXhwb3J0IGNvbnN0IGRhdGFNb2RlbCA9IHtcclxuICAgIGFwcE5hbWU6IFwiU3RvcnkgTWFwIEFwcFwiLFxyXG4gICAgYWJvdXQ6IFwiQXBsaWthc2kgaW5pIGRhcGF0IG1lbmFuZGFrYW4gc2VidWFoIGxva2FzaSB1bnR1ayBtZWVsYWt1a2FuIHNoYXJlIGZvdG8gbWlyaXAgc2VwZXJ0aSBtZW1idWF0IHN0b3J5LlwiLFxyXG4gICAgY29udGFjdDogXCJGb2xsb3cgSUcgQGthcmVlbV9id1wiLFxyXG59O1xyXG4iLCIvLyBhcGlNb2RlbC5qc1xyXG5jb25zdCBCQVNFX1VSTCA9IFwiaHR0cHM6Ly9zdG9yeS1hcGkuZGljb2RpbmcuZGV2L3YxXCI7XHJcblxyXG5leHBvcnQgY29uc3QgYXBpTW9kZWwgPSB7XHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICAvLyDwn5SQIEF1dGVudGlrYXNpXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICBhc3luYyByZWdpc3RlcihuYW1lLCBlbWFpbCwgcGFzc3dvcmQpIHtcclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke0JBU0VfVVJMfS9yZWdpc3RlcmAsIHtcclxuICAgICAgICAgICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXHJcbiAgICAgICAgICAgICAgICBoZWFkZXJzOiB7IFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiIH0sXHJcbiAgICAgICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IG5hbWUsIGVtYWlsLCBwYXNzd29yZCB9KSxcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgICAgICBpZiAoZGF0YS5lcnJvcikgdGhyb3cgbmV3IEVycm9yKGRhdGEubWVzc2FnZSk7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IHRydWUsIG1lc3NhZ2U6IFwiUmVnaXN0cmFzaSBiZXJoYXNpbCEgU2lsYWthbiBsb2dpbi5cIiB9O1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwi4p2MIFJlZ2lzdGVyIGdhZ2FsOlwiLCBlcnIubWVzc2FnZSk7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBtZXNzYWdlOiBlcnIubWVzc2FnZSB9O1xyXG4gICAgICAgIH1cclxuICAgIH0sXHJcblxyXG4gICAgYXN5bmMgbG9naW4oZW1haWwsIHBhc3N3b3JkKSB7XHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtCQVNFX1VSTH0vbG9naW5gLCB7XHJcbiAgICAgICAgICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxyXG4gICAgICAgICAgICAgICAgaGVhZGVyczogeyBcIkNvbnRlbnQtVHlwZVwiOiBcImFwcGxpY2F0aW9uL2pzb25cIiB9LFxyXG4gICAgICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlbWFpbCwgcGFzc3dvcmQgfSksXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgZGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgaWYgKGRhdGEuZXJyb3IpIHRocm93IG5ldyBFcnJvcihkYXRhLm1lc3NhZ2UpO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgdG9rZW4gPSBkYXRhLmxvZ2luUmVzdWx0LnRva2VuO1xyXG4gICAgICAgICAgICBsb2NhbFN0b3JhZ2Uuc2V0SXRlbShcInRva2VuXCIsIHRva2VuKTtcclxuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oXCJ1c2VyTmFtZVwiLCBkYXRhLmxvZ2luUmVzdWx0Lm5hbWUpO1xyXG5cclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCLinIUgTG9naW4gYmVyaGFzaWwsIHRva2VuIGRpc2ltcGFuIGRpIGxvY2FsU3RvcmFnZVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuIHsgc3VjY2VzczogdHJ1ZSwgbWVzc2FnZTogXCJMb2dpbiBiZXJoYXNpbCFcIiB9O1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwi4p2MIExvZ2luIGdhZ2FsOlwiLCBlcnIubWVzc2FnZSk7XHJcbiAgICAgICAgICAgIHJldHVybiB7IHN1Y2Nlc3M6IGZhbHNlLCBtZXNzYWdlOiBlcnIubWVzc2FnZSB9O1xyXG4gICAgICAgIH1cclxuICAgIH0sXHJcblxyXG4gICAgbG9nb3V0KCkge1xyXG4gICAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFwidG9rZW5cIik7XHJcbiAgICAgICAgbG9jYWxTdG9yYWdlLnJlbW92ZUl0ZW0oXCJ1c2VyTmFtZVwiKTtcclxuICAgICAgICBjb25zb2xlLmxvZyhcIvCfmqogTG9nb3V0IGJlcmhhc2lsLCB0b2tlbiBkaWhhcHVzLlwiKTtcclxuICAgIH0sXHJcblxyXG4gICAgZ2V0VG9rZW4oKSB7XHJcbiAgICAgICAgcmV0dXJuIGxvY2FsU3RvcmFnZS5nZXRJdGVtKFwidG9rZW5cIik7XHJcbiAgICB9LFxyXG5cclxuICAgIGlzTG9nZ2VkSW4oKSB7XHJcbiAgICAgICAgcmV0dXJuICEhbG9jYWxTdG9yYWdlLmdldEl0ZW0oXCJ0b2tlblwiKTtcclxuICAgIH0sXHJcblxyXG4gICAgLy8gPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICAgLy8g8J+TnCBEYXRhIFN0b3J5XHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICBhc3luYyBnZXRTdG9yaWVzKCkge1xyXG4gICAgICAgIGNvbnN0IHRva2VuID0gdGhpcy5nZXRUb2tlbigpO1xyXG4gICAgICAgIGlmICghdG9rZW4pIHtcclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwi4pqg77iPIFRpZGFrIGFkYSB0b2tlbiwgc2lsYWthbiBsb2dpbiBkdWx1LlwiKTtcclxuICAgICAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgaWYgb2ZmbGluZSBhbmQgdXNlIGNhY2hlZCBkYXRhXHJcbiAgICAgICAgaWYgKCFuYXZpZ2F0b3Iub25MaW5lKSB7XHJcbiAgICAgICAgICAgIGNvbnN0IGNhY2hlZFN0b3JpZXMgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY2FjaGVkU3RvcmllcycpO1xyXG4gICAgICAgICAgICBpZiAoY2FjaGVkU3Rvcmllcykge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCLwn5OmIFVzaW5nIGNhY2hlZCBzdG9yaWVzIGZyb20gbG9jYWxTdG9yYWdlIChvZmZsaW5lIG1vZGUpXCIpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoY2FjaGVkU3Rvcmllcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgY29uc29sZS53YXJuKFwi4pqg77iPIE5vIGNhY2hlZCBzdG9yaWVzIGF2YWlsYWJsZSBvZmZsaW5lXCIpO1xyXG4gICAgICAgICAgICByZXR1cm4gW107XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke0JBU0VfVVJMfS9zdG9yaWVzYCwge1xyXG4gICAgICAgICAgICAgICAgaGVhZGVyczogeyBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7dG9rZW59YCB9LFxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgaWYgKHJlc3VsdC5lcnJvcikgdGhyb3cgbmV3IEVycm9yKHJlc3VsdC5tZXNzYWdlKTtcclxuXHJcbiAgICAgICAgICAgIC8vIENhY2hlIHRoZSBzdG9yaWVzIGluIGxvY2FsU3RvcmFnZSBmb3Igb2ZmbGluZSB1c2VcclxuICAgICAgICAgICAgbG9jYWxTdG9yYWdlLnNldEl0ZW0oJ2NhY2hlZFN0b3JpZXMnLCBKU09OLnN0cmluZ2lmeShyZXN1bHQubGlzdFN0b3J5KSk7XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKGDwn5OmICR7cmVzdWx0Lmxpc3RTdG9yeS5sZW5ndGh9IHN0b3J5IGJlcmhhc2lsIGRpYW1iaWwgZGFuIGRpLWNhY2hlLmApO1xyXG4gICAgICAgICAgICByZXR1cm4gcmVzdWx0Lmxpc3RTdG9yeTtcclxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIuKdjCBHYWdhbCBtZW11YXQgc3Rvcnk6XCIsIGVyci5tZXNzYWdlKTtcclxuICAgICAgICAgICAgLy8gRmFsbGJhY2sgdG8gbG9jYWxTdG9yYWdlIGNhY2hlXHJcbiAgICAgICAgICAgIGNvbnN0IGNhY2hlZFN0b3JpZXMgPSBsb2NhbFN0b3JhZ2UuZ2V0SXRlbSgnY2FjaGVkU3RvcmllcycpO1xyXG4gICAgICAgICAgICBpZiAoY2FjaGVkU3Rvcmllcykge1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCLwn5OmIFVzaW5nIGNhY2hlZCBzdG9yaWVzIGZyb20gbG9jYWxTdG9yYWdlXCIpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuIEpTT04ucGFyc2UoY2FjaGVkU3Rvcmllcyk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgcmV0dXJuIFtdO1xyXG4gICAgICAgIH1cclxuICAgIH0sXHJcblxyXG4gICAgYXN5bmMgYWRkU3RvcnkoZm9ybURhdGEpIHtcclxuICAgICAgICBjb25zdCB0b2tlbiA9IHRoaXMuZ2V0VG9rZW4oKTtcclxuICAgICAgICBpZiAoIXRva2VuKSByZXR1cm4geyBlcnJvcjogdHJ1ZSwgbWVzc2FnZTogXCJTaWxha2FuIGxvZ2luIHRlcmxlYmloIGRhaHVsdS5cIiB9O1xyXG5cclxuICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGZldGNoKGAke0JBU0VfVVJMfS9zdG9yaWVzYCwge1xyXG4gICAgICAgICAgICAgICAgbWV0aG9kOiBcIlBPU1RcIixcclxuICAgICAgICAgICAgICAgIGhlYWRlcnM6IHsgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3Rva2VufWAgfSxcclxuICAgICAgICAgICAgICAgIGJvZHk6IGZvcm1EYXRhLFxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcclxuICAgICAgICAgICAgaWYgKHJlc3VsdC5lcnJvcikgdGhyb3cgbmV3IEVycm9yKHJlc3VsdC5tZXNzYWdlKTtcclxuXHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwi4pyFIFN0b3J5IGJlcmhhc2lsIGRpdGFtYmFoa2FuIVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuIHsgZXJyb3I6IGZhbHNlLCBtZXNzYWdlOiBcIlN0b3J5IGJlcmhhc2lsIGRpa2lyaW0hXCIgfTtcclxuICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIuKdjCBHYWdhbCBtZW5naXJpbSBzdG9yeTpcIiwgZXJyLm1lc3NhZ2UpO1xyXG4gICAgICAgICAgICByZXR1cm4geyBlcnJvcjogdHJ1ZSwgbWVzc2FnZTogZXJyLm1lc3NhZ2UgfTtcclxuICAgICAgICB9XHJcbiAgICB9LFxyXG5cclxuICAgIC8vID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cclxuICAgIC8vIPCflJQgV2ViIFB1c2ggTm90aWZpY2F0aW9uXHJcbiAgICAvLyA9PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgICBhc3luYyBzdWJzY3JpYmVXZWJQdXNoKHN1YnNjcmlwdGlvbikge1xyXG4gICAgICAgIGNvbnN0IHRva2VuID0gdGhpcy5nZXRUb2tlbigpO1xyXG4gICAgICAgIGlmICghdG9rZW4pIHJldHVybiB7IGVycm9yOiB0cnVlLCBtZXNzYWdlOiBcIlNpbGFrYW4gbG9naW4gdGVybGViaWggZGFodWx1LlwiIH07XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIC8vIEZvcm1hdCBzZXN1YWkgZG9rdW1lbnRhc2lcclxuICAgICAgICAgICAgY29uc3QgYm9keSA9IHtcclxuICAgICAgICAgICAgICAgIGVuZHBvaW50OiBzdWJzY3JpcHRpb24uZW5kcG9pbnQsXHJcbiAgICAgICAgICAgICAgICBrZXlzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgcDI1NmRoOiBzdWJzY3JpcHRpb24ua2V5cy5wMjU2ZGgsXHJcbiAgICAgICAgICAgICAgICAgICAgYXV0aDogc3Vic2NyaXB0aW9uLmtleXMuYXV0aFxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtCQVNFX1VSTH0vbm90aWZpY2F0aW9ucy9zdWJzY3JpYmVgLCB7XHJcbiAgICAgICAgICAgICAgICBtZXRob2Q6IFwiUE9TVFwiLFxyXG4gICAgICAgICAgICAgICAgaGVhZGVyczoge1xyXG4gICAgICAgICAgICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiLFxyXG4gICAgICAgICAgICAgICAgICAgIEF1dGhvcml6YXRpb246IGBCZWFyZXIgJHt0b2tlbn1gXHJcbiAgICAgICAgICAgICAgICB9LFxyXG4gICAgICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoYm9keSksXHJcbiAgICAgICAgICAgIH0pO1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xyXG4gICAgICAgICAgICBpZiAocmVzdWx0LmVycm9yKSB0aHJvdyBuZXcgRXJyb3IocmVzdWx0Lm1lc3NhZ2UpO1xyXG5cclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCLinIUgV2ViUHVzaCBzdWJzY3JpcHRpb24gYmVyaGFzaWw6XCIsIHJlc3VsdCk7XHJcbiAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiBmYWxzZSwgbWVzc2FnZTogcmVzdWx0Lm1lc3NhZ2UsIGRhdGE6IHJlc3VsdC5kYXRhIH07XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCLinYwgRmFpbGVkIHRvIHN1YnNjcmliZSBXZWJQdXNoOlwiLCBlcnIubWVzc2FnZSk7XHJcbiAgICAgICAgICAgIHJldHVybiB7IGVycm9yOiB0cnVlLCBtZXNzYWdlOiBlcnIubWVzc2FnZSB9O1xyXG4gICAgICAgIH1cclxuICAgIH0sXHJcblxyXG4gICAgYXN5bmMgdW5zdWJzY3JpYmVXZWJQdXNoKHN1YnNjcmlwdGlvbikge1xyXG4gICAgICAgIGNvbnN0IHRva2VuID0gdGhpcy5nZXRUb2tlbigpO1xyXG4gICAgICAgIGlmICghdG9rZW4pIHJldHVybiB7IGVycm9yOiB0cnVlLCBtZXNzYWdlOiBcIlNpbGFrYW4gbG9naW4gdGVybGViaWggZGFodWx1LlwiIH07XHJcblxyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIC8vIEhhbnlhIGtpcmltIGVuZHBvaW50IHNlc3VhaSBkb2t1bWVudGFzaVxyXG4gICAgICAgICAgICBjb25zdCBib2R5ID0ge1xyXG4gICAgICAgICAgICAgICAgZW5kcG9pbnQ6IHN1YnNjcmlwdGlvbi5lbmRwb2ludFxyXG4gICAgICAgICAgICB9O1xyXG5cclxuICAgICAgICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtCQVNFX1VSTH0vbm90aWZpY2F0aW9ucy9zdWJzY3JpYmVgLCB7XHJcbiAgICAgICAgICAgICAgICBtZXRob2Q6IFwiREVMRVRFXCIsXHJcbiAgICAgICAgICAgICAgICBoZWFkZXJzOiB7XHJcbiAgICAgICAgICAgICAgICAgICAgXCJDb250ZW50LVR5cGVcIjogXCJhcHBsaWNhdGlvbi9qc29uXCIsXHJcbiAgICAgICAgICAgICAgICAgICAgQXV0aG9yaXphdGlvbjogYEJlYXJlciAke3Rva2VufWBcclxuICAgICAgICAgICAgICAgIH0sXHJcbiAgICAgICAgICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShib2R5KSxcclxuICAgICAgICAgICAgfSk7XHJcblxyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQuZXJyb3IpIHRocm93IG5ldyBFcnJvcihyZXN1bHQubWVzc2FnZSk7XHJcblxyXG4gICAgICAgICAgICBjb25zb2xlLmxvZyhcIuKchSBXZWJQdXNoIHVuc3Vic2NyaXB0aW9uIGJlcmhhc2lsOlwiLCByZXN1bHQpO1xyXG4gICAgICAgICAgICByZXR1cm4geyBlcnJvcjogZmFsc2UsIG1lc3NhZ2U6IHJlc3VsdC5tZXNzYWdlIH07XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCLinYwgRmFpbGVkIHRvIHVuc3Vic2NyaWJlIFdlYlB1c2g6XCIsIGVyci5tZXNzYWdlKTtcclxuICAgICAgICAgICAgcmV0dXJuIHsgZXJyb3I6IHRydWUsIG1lc3NhZ2U6IGVyci5tZXNzYWdlIH07XHJcbiAgICAgICAgfVxyXG4gICAgfSxcclxufTsiLCJpbXBvcnQgeyBhcGlNb2RlbCB9IGZyb20gXCIuLi9zcmMvbW9kZWxzL2FwaU1vZGVsLmpzXCI7XHJcbmltcG9ydCB7IGZhdm9yaXRlREIgfSBmcm9tIFwiLi4vc3JjL2RiL2Zhdm9yaXRlLWRiLmpzXCI7XHJcblxyXG4vLyBEYWZ0YXJrYW4gU2VydmljZSBXb3JrZXJcclxuaWYgKFwic2VydmljZVdvcmtlclwiIGluIG5hdmlnYXRvcikge1xyXG4gICAgbmF2aWdhdG9yLnNlcnZpY2VXb3JrZXJcclxuICAgICAgICAucmVnaXN0ZXIoXCIvc3cuanNcIilcclxuICAgICAgICAudGhlbigoKSA9PiBjb25zb2xlLmxvZyhcIuKchSBTZXJ2aWNlIFdvcmtlciB0ZXJkYWZ0YXJcIikpXHJcbiAgICAgICAgLmNhdGNoKChlcnIpID0+IGNvbnNvbGUuZXJyb3IoXCLinYwgU1cgZ2FnYWw6XCIsIGVycikpO1xyXG59XHJcblxyXG4vLyBTaW1wYW4gZXZlbnQgaW5zdGFsbCBwcm9tcHRcclxubGV0IGRlZmVycmVkUHJvbXB0O1xyXG53aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImJlZm9yZWluc3RhbGxwcm9tcHRcIiwgKGUpID0+IHtcclxuICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuICAgIGRlZmVycmVkUHJvbXB0ID0gZTtcclxuXHJcbiAgICBjb25zdCBpbnN0YWxsQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImJ1dHRvblwiKTtcclxuICAgIGluc3RhbGxCdG4udGV4dENvbnRlbnQgPSBcIvCfk7EgSW5zdGFsbCBBcGxpa2FzaVwiO1xyXG4gICAgaW5zdGFsbEJ0bi5jbGFzc0xpc3QuYWRkKFwiaW5zdGFsbC1idG5cIik7XHJcbiAgICBkb2N1bWVudC5ib2R5LmFwcGVuZENoaWxkKGluc3RhbGxCdG4pO1xyXG5cclxuICAgIGluc3RhbGxCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsIGFzeW5jICgpID0+IHtcclxuICAgICAgICBpbnN0YWxsQnRuLnN0eWxlLmRpc3BsYXkgPSBcIm5vbmVcIjtcclxuICAgICAgICBkZWZlcnJlZFByb21wdC5wcm9tcHQoKTtcclxuICAgICAgICBjb25zdCB7IG91dGNvbWUgfSA9IGF3YWl0IGRlZmVycmVkUHJvbXB0LnVzZXJDaG9pY2U7XHJcbiAgICAgICAgY29uc29sZS5sb2coYFVzZXIgY2hvaWNlOiAke291dGNvbWV9YCk7XHJcbiAgICAgICAgZGVmZXJyZWRQcm9tcHQgPSBudWxsO1xyXG4gICAgfSk7XHJcbn0pO1xyXG5cclxuLy8gT25saW5lIHN5bmMgaGFuZGxlciBmb3Igb2ZmbGluZSBzdG9yaWVzXHJcbndpbmRvdy5hZGRFdmVudExpc3RlbmVyKCdvbmxpbmUnLCBhc3luYyAoKSA9PiB7XHJcbiAgICBpZiAoYXBpTW9kZWwuaXNMb2dnZWRJbigpKSB7XHJcbiAgICAgICAgYXdhaXQgZmF2b3JpdGVEQi5zeW5jT2ZmbGluZVN0b3JpZXMoYXBpTW9kZWwpO1xyXG4gICAgfVxyXG59KTtcclxuXHJcbi8vIFB1c2ggTm90aWZpY2F0aW9uIFN1YnNjcmlwdGlvbiBNYW5hZ2VtZW50XHJcbmNvbnN0IFZBUElEX1BVQkxJQ19LRVkgPSBcIkJDQ3MyZW9uTUktNkgyY3R2RmFXZy1VWWREdjM4N1Zub19ielV6QUxwQjQ0MnIybENuc0htdHJ4OGJpeVBpX0UtMWZTR0FCS19Rc19HbHZQb0pKcXhia1wiO1xyXG5cclxuZXhwb3J0IGNvbnN0IHB1c2hNYW5hZ2VyID0ge1xyXG4gICAgYXN5bmMgc3Vic2NyaWJlKCkge1xyXG4gICAgICAgIGlmICghKFwic2VydmljZVdvcmtlclwiIGluIG5hdmlnYXRvcikgfHwgIShcIlB1c2hNYW5hZ2VyXCIgaW4gd2luZG93KSkge1xyXG4gICAgICAgICAgICBjb25zb2xlLndhcm4oXCJQdXNoIG5vdGlmaWNhdGlvbnMgbm90IHN1cHBvcnRlZFwiKTtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgY29uc3QgcmVnaXN0cmF0aW9uID0gYXdhaXQgbmF2aWdhdG9yLnNlcnZpY2VXb3JrZXIucmVhZHk7XHJcbiAgICAgICAgICAgIGNvbnN0IHN1YnNjcmlwdGlvbiA9IGF3YWl0IHJlZ2lzdHJhdGlvbi5wdXNoTWFuYWdlci5zdWJzY3JpYmUoe1xyXG4gICAgICAgICAgICAgICAgdXNlclZpc2libGVPbmx5OiB0cnVlLFxyXG4gICAgICAgICAgICAgICAgYXBwbGljYXRpb25TZXJ2ZXJLZXk6IHRoaXMudXJsQmFzZTY0VG9VaW50OEFycmF5KFZBUElEX1BVQkxJQ19LRVkpLFxyXG4gICAgICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgICAgIC8vIFNlbmQgc3Vic2NyaXB0aW9uIHRvIHNlcnZlclxyXG4gICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBhcGlNb2RlbC5zdWJzY3JpYmVXZWJQdXNoKHN1YnNjcmlwdGlvbi50b0pTT04oKSk7XHJcbiAgICAgICAgICAgIGlmIChyZXN1bHQuZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCLinYwgRmFpbGVkIHRvIHJlZ2lzdGVyIHN1YnNjcmlwdGlvbiBvbiBzZXJ2ZXJcIik7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBzdWJzY3JpcHRpb24udW5zdWJzY3JpYmUoKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCLinIUgUHVzaCBzdWJzY3JpcHRpb24gYmVyaGFzaWw6XCIsIHN1YnNjcmlwdGlvbik7XHJcbiAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5zZXRJdGVtKFwicHVzaFN1YnNjcmlwdGlvblwiLCBKU09OLnN0cmluZ2lmeShzdWJzY3JpcHRpb24pKTtcclxuICAgICAgICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCLinYwgUHVzaCBzdWJzY3JpcHRpb24gZ2FnYWw6XCIsIGVycik7XHJcbiAgICAgICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgICAgICB9XHJcbiAgICB9LFxyXG5cclxuICAgIGFzeW5jIHVuc3Vic2NyaWJlKCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlZ2lzdHJhdGlvbiA9IGF3YWl0IG5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLnJlYWR5O1xyXG4gICAgICAgICAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBhd2FpdCByZWdpc3RyYXRpb24ucHVzaE1hbmFnZXIuZ2V0U3Vic2NyaXB0aW9uKCk7XHJcbiAgICAgICAgICAgIGlmIChzdWJzY3JpcHRpb24pIHtcclxuICAgICAgICAgICAgICAgIC8vIFNlbmQgdW5zdWJzY3JpcHRpb24gdG8gc2VydmVyXHJcbiAgICAgICAgICAgICAgICBjb25zdCByZXN1bHQgPSBhd2FpdCBhcGlNb2RlbC51bnN1YnNjcmliZVdlYlB1c2goc3Vic2NyaXB0aW9uLnRvSlNPTigpKTtcclxuICAgICAgICAgICAgICAgIGlmIChyZXN1bHQuZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgICAgICBjb25zb2xlLmVycm9yKFwi4p2MIEZhaWxlZCB0byB1bnJlZ2lzdGVyIHN1YnNjcmlwdGlvbiBvbiBzZXJ2ZXJcIik7XHJcbiAgICAgICAgICAgICAgICAgICAgLy8gQ29udGludWUgd2l0aCBsb2NhbCB1bnN1YnNjcmliZSBhbnl3YXlcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgICAgIGF3YWl0IHN1YnNjcmlwdGlvbi51bnN1YnNjcmliZSgpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCLinIUgUHVzaCBzdWJzY3JpcHRpb24gZGliYXRhbGthblwiKTtcclxuICAgICAgICAgICAgICAgIGxvY2FsU3RvcmFnZS5yZW1vdmVJdGVtKFwicHVzaFN1YnNjcmlwdGlvblwiKTtcclxuICAgICAgICAgICAgICAgIHJldHVybiB0cnVlO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCLinYwgVW5zdWJzY3JpYmUgZ2FnYWw6XCIsIGVycik7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBmYWxzZTtcclxuICAgIH0sXHJcblxyXG4gICAgYXN5bmMgaXNTdWJzY3JpYmVkKCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHJlZ2lzdHJhdGlvbiA9IGF3YWl0IG5hdmlnYXRvci5zZXJ2aWNlV29ya2VyLnJlYWR5O1xyXG4gICAgICAgICAgICBjb25zdCBzdWJzY3JpcHRpb24gPSBhd2FpdCByZWdpc3RyYXRpb24ucHVzaE1hbmFnZXIuZ2V0U3Vic2NyaXB0aW9uKCk7XHJcbiAgICAgICAgICAgIHJldHVybiAhIXN1YnNjcmlwdGlvbjtcclxuICAgICAgICB9IGNhdGNoIHtcclxuICAgICAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICAgIH1cclxuICAgIH0sXHJcblxyXG4gICAgdXJsQmFzZTY0VG9VaW50OEFycmF5KGJhc2U2NFN0cmluZykge1xyXG4gICAgICAgIGNvbnN0IHBhZGRpbmcgPSBcIj1cIi5yZXBlYXQoKDQgLSAoYmFzZTY0U3RyaW5nLmxlbmd0aCAlIDQpKSAlIDQpO1xyXG4gICAgICAgIGNvbnN0IGJhc2U2NCA9IChiYXNlNjRTdHJpbmcgKyBwYWRkaW5nKS5yZXBsYWNlKC8tL2csIFwiK1wiKS5yZXBsYWNlKC9fL2csIFwiL1wiKTtcclxuICAgICAgICBjb25zdCByYXdEYXRhID0gd2luZG93LmF0b2IoYmFzZTY0KTtcclxuICAgICAgICBjb25zdCBvdXRwdXRBcnJheSA9IG5ldyBVaW50OEFycmF5KHJhd0RhdGEubGVuZ3RoKTtcclxuICAgICAgICBmb3IgKGxldCBpID0gMDsgaSA8IHJhd0RhdGEubGVuZ3RoOyArK2kpIHtcclxuICAgICAgICAgICAgb3V0cHV0QXJyYXlbaV0gPSByYXdEYXRhLmNoYXJDb2RlQXQoaSk7XHJcbiAgICAgICAgfVxyXG4gICAgICAgIHJldHVybiBvdXRwdXRBcnJheTtcclxuICAgIH0sXHJcbn07XHJcbiIsImltcG9ydCB7IGRhdGFNb2RlbCB9IGZyb20gXCIuLi9tb2RlbHMvZGF0YU1vZGVsLmpzXCI7XHJcbmltcG9ydCB7IHB1c2hNYW5hZ2VyIH0gZnJvbSBcIi4uLy4uL3NjcmlwdHMvcHdhLWluaXQuanNcIjtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEhvbWVWaWV3IHtcclxuICAgIHJlbmRlcigpIHtcclxuICAgICAgICBjb25zdCBkaXYgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICAgIGRpdi5jbGFzc05hbWUgPSBcInBhZ2UgcGFnZS1ob21lXCI7XHJcbiAgICAgICAgZGl2LnNldEF0dHJpYnV0ZShcInJvbGVcIiwgXCJyZWdpb25cIik7XHJcbiAgICAgICAgZGl2LnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxsZWRieVwiLCBcImhvbWUtdGl0bGVcIik7XHJcblxyXG4gICAgICAgIGRpdi5pbm5lckhUTUwgPSBgXHJcbiAgICAgICAgICAgIDxoMSBpZD1cImhvbWUtdGl0bGVcIiBjbGFzcz1cInBhZ2UtdGl0bGVcIiB0YWJpbmRleD1cIjBcIj5cclxuICAgICAgICAgICAgICAgIFdlbGNvbWUgdG8gJHtkYXRhTW9kZWwuYXBwTmFtZX1cclxuICAgICAgICAgICAgPC9oMT5cclxuICAgICAgICAgICAgPHAgY2xhc3M9XCJwYWdlLXRleHRcIiBhcmlhLWxhYmVsPVwiRGVza3JpcHNpIGhhbGFtYW4gaG9tZVwiPlxyXG4gICAgICAgICAgICAgICAgSW5pIGFkYWxhaCBoYWxhbWFuIEhvbWUgZGVuZ2FuIHRyYW5zaXNpIGN1c3RvbS5cclxuICAgICAgICAgICAgPC9wPlxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibm90aWZpY2F0aW9uLXNldHRpbmdzXCI+XHJcbiAgICAgICAgICAgICAgICA8YnV0dG9uIGlkPVwidG9nZ2xlLW5vdGlmaWNhdGlvbnNcIiBjbGFzcz1cImJ0bi10b2dnbGUtbm90aWZpY2F0aW9uc1wiPlxyXG4gICAgICAgICAgICAgICAgICAgIEVuYWJsZSBQdXNoIE5vdGlmaWNhdGlvbnNcclxuICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgICAgPHAgaWQ9XCJub3RpZmljYXRpb24tc3RhdHVzXCIgY2xhc3M9XCJub3RpZmljYXRpb24tc3RhdHVzXCI+Q2hlY2tpbmcgc3RhdHVzLi4uPC9wPlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICBgO1xyXG4gICAgICAgIHJldHVybiBkaXY7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgYWZ0ZXJSZW5kZXIoKSB7XHJcbiAgICAgICAgY29uc3QgdG9nZ2xlQnRuID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJ0b2dnbGUtbm90aWZpY2F0aW9uc1wiKTtcclxuICAgICAgICBjb25zdCBzdGF0dXNFbCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwibm90aWZpY2F0aW9uLXN0YXR1c1wiKTtcclxuXHJcbiAgICAgICAgaWYgKCEoXCJzZXJ2aWNlV29ya2VyXCIgaW4gbmF2aWdhdG9yKSB8fCAhKFwiUHVzaE1hbmFnZXJcIiBpbiB3aW5kb3cpKSB7XHJcbiAgICAgICAgICAgIHN0YXR1c0VsLnRleHRDb250ZW50ID0gXCJQdXNoIG5vdGlmaWNhdGlvbnMgbm90IHN1cHBvcnRlZCBpbiB0aGlzIGJyb3dzZXIuXCI7XHJcbiAgICAgICAgICAgIHRvZ2dsZUJ0bi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIENoZWNrIGlmIHJ1bm5pbmcgb24gSFRUUFMgKHJlcXVpcmVkIGZvciBwdXNoIG5vdGlmaWNhdGlvbnMpXHJcbiAgICAgICAgaWYgKGxvY2F0aW9uLnByb3RvY29sICE9PSAnaHR0cHM6JyAmJiBsb2NhdGlvbi5ob3N0bmFtZSAhPT0gJ2xvY2FsaG9zdCcpIHtcclxuICAgICAgICAgICAgc3RhdHVzRWwudGV4dENvbnRlbnQgPSBcIlB1c2ggbm90aWZpY2F0aW9ucyByZXF1aXJlIEhUVFBTLiBQbGVhc2UgYWNjZXNzIHZpYSBzZWN1cmUgY29ubmVjdGlvbi5cIjtcclxuICAgICAgICAgICAgdG9nZ2xlQnRuLmRpc2FibGVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2hlY2sgY3VycmVudCBzdWJzY3JpcHRpb24gc3RhdHVzXHJcbiAgICAgICAgY29uc3QgaXNTdWJzY3JpYmVkID0gYXdhaXQgcHVzaE1hbmFnZXIuaXNTdWJzY3JpYmVkKCk7XHJcbiAgICAgICAgdGhpcy51cGRhdGVVSShpc1N1YnNjcmliZWQsIHRvZ2dsZUJ0biwgc3RhdHVzRWwpO1xyXG5cclxuICAgICAgICAvLyBIYW5kbGUgdG9nZ2xlXHJcbiAgICAgICAgdG9nZ2xlQnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCBhc3luYyAoKSA9PiB7XHJcbiAgICAgICAgICAgIHRvZ2dsZUJ0bi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIHRvZ2dsZUJ0bi50ZXh0Q29udGVudCA9IFwiUHJvY2Vzc2luZy4uLlwiO1xyXG5cclxuICAgICAgICAgICAgbGV0IHN1Y2Nlc3M7XHJcbiAgICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgICAgICBpZiAoaXNTdWJzY3JpYmVkKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgc3VjY2VzcyA9IGF3YWl0IHB1c2hNYW5hZ2VyLnVuc3Vic2NyaWJlKCk7XHJcbiAgICAgICAgICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgICAgICAgICAgIHN1Y2Nlc3MgPSBhd2FpdCBwdXNoTWFuYWdlci5zdWJzY3JpYmUoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJQdXNoIHN1YnNjcmlwdGlvbiBlcnJvcjpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICAgICAgc3VjY2VzcyA9IGZhbHNlO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoc3VjY2Vzcykge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbmV3U3RhdHVzID0gYXdhaXQgcHVzaE1hbmFnZXIuaXNTdWJzY3JpYmVkKCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLnVwZGF0ZVVJKG5ld1N0YXR1cywgdG9nZ2xlQnRuLCBzdGF0dXNFbCk7XHJcbiAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICBhbGVydChcIkZhaWxlZCB0byB1cGRhdGUgbm90aWZpY2F0aW9uIHNldHRpbmdzLiBQbGVhc2UgY2hlY2sgY29uc29sZSBmb3IgZXJyb3JzLlwiKTtcclxuICAgICAgICAgICAgICAgIHRvZ2dsZUJ0bi5kaXNhYmxlZCA9IGZhbHNlO1xyXG4gICAgICAgICAgICAgICAgdG9nZ2xlQnRuLnRleHRDb250ZW50ID0gaXNTdWJzY3JpYmVkID8gXCJEaXNhYmxlIE5vdGlmaWNhdGlvbnNcIiA6IFwiRW5hYmxlIE5vdGlmaWNhdGlvbnNcIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIHVwZGF0ZVVJKGlzU3Vic2NyaWJlZCwgdG9nZ2xlQnRuLCBzdGF0dXNFbCkge1xyXG4gICAgICAgIGlmIChpc1N1YnNjcmliZWQpIHtcclxuICAgICAgICAgICAgdG9nZ2xlQnRuLnRleHRDb250ZW50ID0gXCJEaXNhYmxlIFB1c2ggTm90aWZpY2F0aW9uc1wiO1xyXG4gICAgICAgICAgICBzdGF0dXNFbC50ZXh0Q29udGVudCA9IFwiUHVzaCBub3RpZmljYXRpb25zIGFyZSBlbmFibGVkLlwiO1xyXG4gICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgIHRvZ2dsZUJ0bi50ZXh0Q29udGVudCA9IFwiRW5hYmxlIFB1c2ggTm90aWZpY2F0aW9uc1wiO1xyXG4gICAgICAgICAgICBzdGF0dXNFbC50ZXh0Q29udGVudCA9IFwiUHVzaCBub3RpZmljYXRpb25zIGFyZSBkaXNhYmxlZC5cIjtcclxuICAgICAgICB9XHJcbiAgICAgICAgdG9nZ2xlQnRuLmRpc2FibGVkID0gZmFsc2U7XHJcbiAgICB9XHJcbn1cclxuIiwiaW1wb3J0IHsgZGF0YU1vZGVsIH0gZnJvbSBcIi4uL21vZGVscy9kYXRhTW9kZWwuanNcIjtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEFib3V0VmlldyB7XHJcbiAgICByZW5kZXIoKSB7XHJcbiAgICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgICBkaXYuY2xhc3NOYW1lID0gXCJwYWdlIHBhZ2UtYWJvdXRcIjtcclxuICAgICAgICBkaXYuc2V0QXR0cmlidXRlKFwicm9sZVwiLCBcInJlZ2lvblwiKTtcclxuICAgICAgICBkaXYuc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbGxlZGJ5XCIsIFwiYWJvdXQtdGl0bGVcIik7XHJcbiAgICAgICAgZGl2LmlubmVySFRNTCA9IGBcclxuICAgICAgPGgxIGlkPVwiYWJvdXQtdGl0bGVcIiBjbGFzcz1cInBhZ2UtdGl0bGVcIiB0YWJpbmRleD1cIjBcIj5BYm91dDwvaDE+XHJcbiAgICAgIDxwIGNsYXNzPVwicGFnZS10ZXh0XCIgdGFiaW5kZXg9XCIwXCI+JHtkYXRhTW9kZWwuYWJvdXR9PC9wPlxyXG4gICAgYDtcclxuICAgICAgICByZXR1cm4gZGl2O1xyXG4gICAgfVxyXG59XHJcbiIsImltcG9ydCB7IGRhdGFNb2RlbCB9IGZyb20gXCIuLi9tb2RlbHMvZGF0YU1vZGVsLmpzXCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBDb250YWN0VmlldyB7XHJcbiAgICByZW5kZXIoKSB7XHJcbiAgICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgICAgICBkaXYuY2xhc3NOYW1lID0gXCJwYWdlIHBhZ2UtY29udGFjdFwiO1xyXG4gICAgICAgIGRpdi5zZXRBdHRyaWJ1dGUoXCJyb2xlXCIsIFwicmVnaW9uXCIpO1xyXG4gICAgICAgIGRpdi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsbGVkYnlcIiwgXCJjb250YWN0LXRpdGxlXCIpO1xyXG5cclxuICAgICAgICBkaXYuaW5uZXJIVE1MID0gYFxyXG4gICAgICAgICAgICA8aDEgaWQ9XCJjb250YWN0LXRpdGxlXCIgY2xhc3M9XCJwYWdlLXRpdGxlXCIgdGFiaW5kZXg9XCIwXCI+Q29udGFjdDwvaDE+XHJcbiAgICAgICAgICAgIDxwIGNsYXNzPVwicGFnZS10ZXh0XCIgYXJpYS1sYWJlbD1cIkluZm9ybWFzaSBrb250YWtcIj4ke2RhdGFNb2RlbC5jb250YWN0fTwvcD5cclxuICAgICAgICBgO1xyXG4gICAgICAgIHJldHVybiBkaXY7XHJcbiAgICB9XHJcbn1cclxuIiwiaW1wb3J0IHsgYXBpTW9kZWwgfSBmcm9tIFwiLi4vbW9kZWxzL2FwaU1vZGVsLmpzXCI7XHJcbmltcG9ydCB7IGZhdm9yaXRlREIgfSBmcm9tIFwiLi4vZGIvZmF2b3JpdGUtZGIuanNcIjtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIE1hcFZpZXcge1xyXG4gICAgY29uc3RydWN0b3IoKSB7XHJcbiAgICAgICAgdGhpcy5tYXAgPSBudWxsO1xyXG4gICAgICAgIHRoaXMubWFya2VycyA9IFtdO1xyXG4gICAgICAgIHRoaXMuc3RvcmllcyA9IFtdO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIHJlbmRlcigpIHtcclxuICAgICAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICAgIGNvbnRhaW5lci5jbGFzc05hbWUgPSBcInBhZ2UgcGFnZS1tYXBcIjtcclxuICAgICAgICBjb250YWluZXIuc2V0QXR0cmlidXRlKFwicm9sZVwiLCBcInJlZ2lvblwiKTtcclxuICAgICAgICBjb250YWluZXIuc2V0QXR0cmlidXRlKFwiYXJpYS1sYWJlbGxlZGJ5XCIsIFwibWFwLXRpdGxlXCIpO1xyXG5cclxuICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gYFxyXG4gICAgICAgICAgICA8aDEgaWQ9XCJtYXAtdGl0bGVcIiBjbGFzcz1cInBhZ2UtdGl0bGVcIiB0YWJpbmRleD1cIjBcIj5QZXRhIENlcml0YTwvaDE+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwibWFwLXdyYXBwZXJcIj5cclxuICAgICAgICAgICAgICAgIDxkaXYgaWQ9XCJtYXBcIiBjbGFzcz1cIm1hcFwiIHJvbGU9XCJhcHBsaWNhdGlvblwiIGFyaWEtbGFiZWw9XCJQZXRhIGxva2FzaSBjZXJpdGFcIj48L2Rpdj5cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzdG9yeS1saXN0XCIgcm9sZT1cImxpc3RcIiBhcmlhLWxhYmVsPVwiRGFmdGFyIGNlcml0YVwiPjwvZGl2PlxyXG4gICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICBgO1xyXG5cclxuICAgICAgICAvLyBUdW5nZ3UgRE9NIHRlci1hdHRhY2ggYmFydSBpbml0IG1hcFxyXG4gICAgICAgIHNldFRpbWVvdXQoKCkgPT4gdGhpcy5pbml0TWFwKGNvbnRhaW5lciksIDApO1xyXG5cclxuICAgICAgICByZXR1cm4gY29udGFpbmVyO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGluaXRNYXAoY29udGFpbmVyKSB7XHJcbiAgICAgICAgY29uc3QgbWFwRWwgPSBjb250YWluZXIucXVlcnlTZWxlY3RvcihcIiNtYXBcIik7XHJcbiAgICAgICAgY29uc3QgbGlzdEVsID0gY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3IoXCIuc3RvcnktbGlzdFwiKTtcclxuXHJcbiAgICAgICAgLy8gQ2xlYW51cCBleGlzdGluZyBtYXAgaWYgYW55XHJcbiAgICAgICAgaWYgKHRoaXMubWFwKSB7XHJcbiAgICAgICAgICAgIHRoaXMubWFwLnJlbW92ZSgpO1xyXG4gICAgICAgICAgICB0aGlzLm1hcCA9IG51bGw7XHJcbiAgICAgICAgICAgIHRoaXMubWFya2VycyA9IFtdO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQ2xlYXIgbWFwIGNvbnRhaW5lclxyXG4gICAgICAgIG1hcEVsLmlubmVySFRNTCA9ICcnO1xyXG5cclxuICAgICAgICB0aGlzLnN0b3JpZXMgPSBhd2FpdCBhcGlNb2RlbC5nZXRTdG9yaWVzKCk7XHJcblxyXG4gICAgICAgIC8vIEluaXNpYWxpc2FzaSBMZWFmbGV0IG1hcFxyXG4gICAgICAgIHRoaXMubWFwID0gTC5tYXAobWFwRWwpLnNldFZpZXcoWy0yLjUsIDExOF0sIDUpO1xyXG5cclxuICAgICAgICAvLyBCYXNlIGxheWVyXHJcbiAgICAgICAgY29uc3QgdGlsZTEgPSBMLnRpbGVMYXllcihcImh0dHBzOi8ve3N9LnRpbGUub3BlbnN0cmVldG1hcC5vcmcve3p9L3t4fS97eX0ucG5nXCIsIHtcclxuICAgICAgICAgICAgYXR0cmlidXRpb246IFwiwqkgT3BlblN0cmVldE1hcCBjb250cmlidXRvcnNcIixcclxuICAgICAgICB9KS5hZGRUbyh0aGlzLm1hcCk7XHJcblxyXG4gICAgICAgIGNvbnN0IHRpbGUyID0gTC50aWxlTGF5ZXIoXCJodHRwczovL3tzfS50aWxlLm9wZW50b3BvbWFwLm9yZy97en0ve3h9L3t5fS5wbmdcIiwge1xyXG4gICAgICAgICAgICBhdHRyaWJ1dGlvbjogXCLCqSBPcGVuVG9wb01hcCBjb250cmlidXRvcnNcIixcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gTGF5ZXIgY29udHJvbFxyXG4gICAgICAgIEwuY29udHJvbC5sYXllcnMoeyBcIlN0cmVldCBNYXBcIjogdGlsZTEsIFwiVG9wbyBNYXBcIjogdGlsZTIgfSkuYWRkVG8odGhpcy5tYXApO1xyXG5cclxuICAgICAgICAvLyBQRU5USU5HOiBQYW5nZ2lsIGludmFsaWRhdGVTaXplIHNldGVsYWggbWFwIGRpaW5pc2lhbGlzYXNpXHJcbiAgICAgICAgLy8gZGFuIHBhc3Rpa2FuIGNvbnRhaW5lciBzdWRhaCBtZW1pbGlraSB1a3VyYW4geWFuZyBiZW5hclxyXG4gICAgICAgIHJlcXVlc3RBbmltYXRpb25GcmFtZSgoKSA9PiB7XHJcbiAgICAgICAgICAgIHRoaXMubWFwLmludmFsaWRhdGVTaXplKCk7XHJcbiAgICAgICAgfSk7XHJcblxyXG4gICAgICAgIC8vIFJlbmRlciBkYWZ0YXIgc3RvcnkgZGVuZ2FuIHRvbWJvbCBmYXZvcml0ZVxyXG4gICAgICAgIGF3YWl0IHRoaXMucmVuZGVyU3RvcnlMaXN0KGxpc3RFbCk7XHJcblxyXG4gICAgICAgIC8vIFRhbWJhaGthbiBtYXJrZXIga2UgcGV0YVxyXG4gICAgICAgIHRoaXMuc3Rvcmllcy5mb3JFYWNoKChzdG9yeSwgaSkgPT4ge1xyXG4gICAgICAgICAgICBpZiAoc3RvcnkubGF0ICYmIHN0b3J5Lmxvbikge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgbWFya2VyID0gTC5tYXJrZXIoW3N0b3J5LmxhdCwgc3RvcnkubG9uXSlcclxuICAgICAgICAgICAgICAgICAgICAuYWRkVG8odGhpcy5tYXApXHJcbiAgICAgICAgICAgICAgICAgICAgLmJpbmRQb3B1cChgPGI+JHtzdG9yeS5uYW1lfTwvYj48YnI+JHtzdG9yeS5kZXNjcmlwdGlvbn1gKTtcclxuICAgICAgICAgICAgICAgIHRoaXMubWFya2Vycy5wdXNoKG1hcmtlcik7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gSW50ZXJha3NpIGFudGFyYSBkYWZ0YXIgZGFuIG1hcmtlclxyXG4gICAgICAgIGxpc3RFbC5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKGUpID0+IHtcclxuICAgICAgICAgICAgY29uc3QgaXRlbSA9IGUudGFyZ2V0LmNsb3Nlc3QoXCIuc3RvcnktaXRlbVwiKTtcclxuICAgICAgICAgICAgY29uc3QgZmF2b3JpdGVCdG4gPSBlLnRhcmdldC5jbG9zZXN0KFwiLmJ0bi1mYXZvcml0ZVwiKTtcclxuXHJcbiAgICAgICAgICAgIGlmIChmYXZvcml0ZUJ0bikge1xyXG4gICAgICAgICAgICAgICAgZS5zdG9wUHJvcGFnYXRpb24oKTtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMudG9nZ2xlRmF2b3JpdGUoZmF2b3JpdGVCdG4uZGF0YXNldC5pZCk7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCB0aGlzLnJlbmRlclN0b3J5TGlzdChsaXN0RWwpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBpZiAoIWl0ZW0pIHJldHVybjtcclxuICAgICAgICAgICAgY29uc3QgaW5kZXggPSBpdGVtLmRhdGFzZXQuaW5kZXg7XHJcbiAgICAgICAgICAgIGNvbnN0IHN0b3J5ID0gdGhpcy5zdG9yaWVzW2luZGV4XTtcclxuXHJcbiAgICAgICAgICAgIGlmIChzdG9yeS5sYXQgJiYgc3RvcnkubG9uKSB7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm1hcC5mbHlUbyhbc3RvcnkubGF0LCBzdG9yeS5sb25dLCAxMCk7XHJcbiAgICAgICAgICAgICAgICB0aGlzLm1hcmtlcnNbaW5kZXhdLm9wZW5Qb3B1cCgpO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICBjb250YWluZXJcclxuICAgICAgICAgICAgICAgIC5xdWVyeVNlbGVjdG9yQWxsKFwiLnN0b3J5LWl0ZW1cIilcclxuICAgICAgICAgICAgICAgIC5mb3JFYWNoKChlbCkgPT4gZWwuY2xhc3NMaXN0LnJlbW92ZShcImFjdGl2ZVwiKSk7XHJcbiAgICAgICAgICAgIGl0ZW0uY2xhc3NMaXN0LmFkZChcImFjdGl2ZVwiKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gQWtzZXNpYmlsaXRhcyB0YW1iYWhhbjogbmF2aWdhc2kga2V5Ym9hcmRcclxuICAgICAgICBsaXN0RWwuYWRkRXZlbnRMaXN0ZW5lcihcImtleWRvd25cIiwgKGUpID0+IHtcclxuICAgICAgICAgICAgaWYgKGUua2V5ID09PSBcIkVudGVyXCIgfHwgZS5rZXkgPT09IFwiIFwiKSB7XHJcbiAgICAgICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBpdGVtID0gZS50YXJnZXQuY2xvc2VzdChcIi5zdG9yeS1pdGVtXCIpO1xyXG4gICAgICAgICAgICAgICAgaWYgKGl0ZW0pIGl0ZW0uY2xpY2soKTtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIHJlbmRlclN0b3J5TGlzdChsaXN0RWwpIHtcclxuICAgICAgICBjb25zdCBmYXZvcml0ZXMgPSBhd2FpdCBmYXZvcml0ZURCLmdldEFsbEZhdm9yaXRlcygpO1xyXG4gICAgICAgIGNvbnN0IGZhdm9yaXRlSWRzID0gbmV3IFNldChmYXZvcml0ZXMubWFwKGZhdiA9PiBmYXYuaWQpKTtcclxuXHJcbiAgICAgICAgbGlzdEVsLmlubmVySFRNTCA9IHRoaXMuc3Rvcmllc1xyXG4gICAgICAgICAgICAubWFwKFxyXG4gICAgICAgICAgICAgICAgKHN0b3J5LCBpbmRleCkgPT4gYFxyXG4gICAgICAgICAgICA8ZGl2XHJcbiAgICAgICAgICAgICAgICBjbGFzcz1cInN0b3J5LWl0ZW1cIlxyXG4gICAgICAgICAgICAgICAgZGF0YS1pbmRleD1cIiR7aW5kZXh9XCJcclxuICAgICAgICAgICAgICAgIHJvbGU9XCJsaXN0aXRlbVwiXHJcbiAgICAgICAgICAgICAgICB0YWJpbmRleD1cIjBcIlxyXG4gICAgICAgICAgICAgICAgYXJpYS1sYWJlbD1cIkNlcml0YSBvbGVoICR7c3RvcnkubmFtZX1cIlxyXG4gICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgICA8aW1nXHJcbiAgICAgICAgICAgICAgICAgICAgc3JjPVwiJHtzdG9yeS5waG90b1VybH1cIlxyXG4gICAgICAgICAgICAgICAgICAgIGFsdD1cIkZvdG8gY2VyaXRhIG9sZWggJHtzdG9yeS5uYW1lfVwiXHJcbiAgICAgICAgICAgICAgICAgICAgY2xhc3M9XCJzdG9yeS1pbWdcIlxyXG4gICAgICAgICAgICAgICAgICAgIGxvYWRpbmc9XCJsYXp5XCJcclxuICAgICAgICAgICAgICAgIC8+XHJcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwic3RvcnktY29udGVudFwiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxoMyBjbGFzcz1cInN0b3J5LXRpdGxlXCI+JHtzdG9yeS5uYW1lfTwvaDM+XHJcbiAgICAgICAgICAgICAgICAgICAgPHAgY2xhc3M9XCJzdG9yeS1kZXNjXCI+JHtzdG9yeS5kZXNjcmlwdGlvbn08L3A+XHJcbiAgICAgICAgICAgICAgICAgICAgPHAgY2xhc3M9XCJzdG9yeS1kYXRlXCI+JHtuZXcgRGF0ZShzdG9yeS5jcmVhdGVkQXQpLnRvTG9jYWxlRGF0ZVN0cmluZygpfTwvcD5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICAgICAgPGJ1dHRvblxyXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzPVwiYnRuLWZhdm9yaXRlICR7ZmF2b3JpdGVJZHMuaGFzKHN0b3J5LmlkKSA/ICdmYXZvcml0ZWQnIDogJyd9XCJcclxuICAgICAgICAgICAgICAgICAgICBkYXRhLWlkPVwiJHtzdG9yeS5pZH1cIlxyXG4gICAgICAgICAgICAgICAgICAgIGFyaWEtbGFiZWw9XCIke2Zhdm9yaXRlSWRzLmhhcyhzdG9yeS5pZCkgPyAnUmVtb3ZlIGZyb20gZmF2b3JpdGVzJyA6ICdBZGQgdG8gZmF2b3JpdGVzJ31cIlxyXG4gICAgICAgICAgICAgICAgPlxyXG4gICAgICAgICAgICAgICAgICAgICR7ZmF2b3JpdGVJZHMuaGFzKHN0b3J5LmlkKSA/ICfinaTvuI8nIDogJ/CfpI0nfVxyXG4gICAgICAgICAgICAgICAgPC9idXR0b24+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgICAgICBgXHJcbiAgICAgICAgICAgIClcclxuICAgICAgICAgICAgLmpvaW4oXCJcIik7XHJcbiAgICB9XHJcblxyXG4gICAgYXN5bmMgdG9nZ2xlRmF2b3JpdGUoc3RvcnlJZCkge1xyXG4gICAgICAgIGNvbnN0IHN0b3J5ID0gdGhpcy5zdG9yaWVzLmZpbmQocyA9PiBzLmlkID09PSBzdG9yeUlkKTtcclxuICAgICAgICBpZiAoIXN0b3J5KSByZXR1cm47XHJcblxyXG4gICAgICAgIGNvbnN0IGZhdm9yaXRlcyA9IGF3YWl0IGZhdm9yaXRlREIuZ2V0QWxsRmF2b3JpdGVzKCk7XHJcbiAgICAgICAgY29uc3QgaXNGYXZvcml0ZWQgPSBmYXZvcml0ZXMuc29tZShmYXYgPT4gZmF2LmlkID09PSBzdG9yeUlkKTtcclxuXHJcbiAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgaWYgKGlzRmF2b3JpdGVkKSB7XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBmYXZvcml0ZURCLmRlbGV0ZUZhdm9yaXRlKHN0b3J5SWQpO1xyXG4gICAgICAgICAgICAgICAgY29uc29sZS5sb2coXCJSZW1vdmVkIGZyb20gZmF2b3JpdGVzOlwiLCBzdG9yeS5uYW1lKTtcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGZhdm9yaXRlRGF0YSA9IHtcclxuICAgICAgICAgICAgICAgICAgICBpZDogc3RvcnkuaWQsXHJcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogc3RvcnkubmFtZSxcclxuICAgICAgICAgICAgICAgICAgICBkZXNjcmlwdGlvbjogc3RvcnkuZGVzY3JpcHRpb24sXHJcbiAgICAgICAgICAgICAgICAgICAgcGhvdG9Vcmw6IHN0b3J5LnBob3RvVXJsLFxyXG4gICAgICAgICAgICAgICAgICAgIGxhdDogc3RvcnkubGF0LFxyXG4gICAgICAgICAgICAgICAgICAgIGxvbjogc3RvcnkubG9uLFxyXG4gICAgICAgICAgICAgICAgICAgIGNyZWF0ZWRBdDogc3RvcnkuY3JlYXRlZEF0IHx8IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcclxuICAgICAgICAgICAgICAgIH07XHJcbiAgICAgICAgICAgICAgICBhd2FpdCBmYXZvcml0ZURCLmFkZEZhdm9yaXRlKGZhdm9yaXRlRGF0YSk7XHJcbiAgICAgICAgICAgICAgICBjb25zb2xlLmxvZyhcIkFkZGVkIHRvIGZhdm9yaXRlczpcIiwgc3RvcnkubmFtZSk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgdG9nZ2xpbmcgZmF2b3JpdGU6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgYWxlcnQoXCJGYWlsZWQgdG8gdXBkYXRlIGZhdm9yaXRlc1wiKTtcclxuICAgICAgICB9XHJcbiAgICB9XHJcbn0iLCJpbXBvcnQgeyBhcGlNb2RlbCB9IGZyb20gXCIuLi9tb2RlbHMvYXBpTW9kZWwuanNcIjtcclxuXHJcbmV4cG9ydCBkZWZhdWx0IGNsYXNzIEFkZFN0b3J5VmlldyB7XHJcbiAgcmVuZGVyKCkge1xyXG4gICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImRpdlwiKTtcclxuICAgIGRpdi5jbGFzc05hbWUgPSBcInBhZ2UgcGFnZS1hZGQtc3RvcnlcIjtcclxuICAgIGRpdi5zZXRBdHRyaWJ1dGUoXCJyb2xlXCIsIFwicmVnaW9uXCIpO1xyXG4gICAgZGl2LnNldEF0dHJpYnV0ZShcImFyaWEtbGFiZWxsZWRieVwiLCBcImFkZC1zdG9yeS10aXRsZVwiKTtcclxuXHJcbiAgICBkaXYuaW5uZXJIVE1MID0gYFxyXG4gICAgICA8aDEgaWQ9XCJhZGQtc3RvcnktdGl0bGVcIiB0YWJpbmRleD1cIjBcIj5UYW1iYWggQ2VyaXRhIEJhcnU8L2gxPlxyXG5cclxuICAgICAgPGZvcm0gaWQ9XCJhZGRTdG9yeUZvcm1cIiBjbGFzcz1cImFkZC1zdG9yeS1mb3JtXCIgYXJpYS1kZXNjcmliZWRieT1cImZvcm0tZGVzY1wiPlxyXG4gICAgICAgIDxwIGlkPVwiZm9ybS1kZXNjXCIgY2xhc3M9XCJzci1vbmx5XCI+PC9wPlxyXG5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cFwiPlxyXG4gICAgICAgICAgPGxhYmVsIGZvcj1cImRlc2NyaXB0aW9uXCI+RGVza3JpcHNpIENlcml0YTwvbGFiZWw+XHJcbiAgICAgICAgICA8dGV4dGFyZWEgXHJcbiAgICAgICAgICAgIGlkPVwiZGVzY3JpcHRpb25cIiBcclxuICAgICAgICAgICAgbmFtZT1cImRlc2NyaXB0aW9uXCIgXHJcbiAgICAgICAgICAgIHBsYWNlaG9sZGVyPVwiVHVsaXNrYW4gZGVza3JpcHNpLi4uXCIgXHJcbiAgICAgICAgICAgIGFyaWEtcmVxdWlyZWQ9XCJ0cnVlXCJcclxuICAgICAgICAgICAgcmVxdWlyZWRcclxuICAgICAgICAgID48L3RleHRhcmVhPlxyXG4gICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cFwiPlxyXG4gICAgICAgICAgPGxhYmVsIGZvcj1cInBob3RvXCI+VXBsb2FkIEdhbWJhcjwvbGFiZWw+XHJcbiAgICAgICAgICA8aW5wdXQgXHJcbiAgICAgICAgICAgIHR5cGU9XCJmaWxlXCIgXHJcbiAgICAgICAgICAgIGlkPVwicGhvdG9cIiBcclxuICAgICAgICAgICAgbmFtZT1cInBob3RvXCIgXHJcbiAgICAgICAgICAgIGFjY2VwdD1cImltYWdlLypcIiBcclxuICAgICAgICAgICAgYXJpYS1yZXF1aXJlZD1cInRydWVcIlxyXG4gICAgICAgICAgICByZXF1aXJlZFxyXG4gICAgICAgICAgPlxyXG4gICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICA8ZGl2IGNsYXNzPVwiZm9ybS1ncm91cFwiIHJvbGU9XCJncm91cFwiIGFyaWEtbGFiZWxsZWRieT1cIm1hcC1sYWJlbFwiPlxyXG4gICAgICAgICAgPGxhYmVsIGlkPVwibWFwLWxhYmVsXCI+UGlsaWggTG9rYXNpIGRpIFBldGE8L2xhYmVsPlxyXG4gICAgICAgICAgPGRpdiBpZD1cIm1hcFwiIHJvbGU9XCJhcHBsaWNhdGlvblwiIGFyaWEtbGFiZWw9XCJQZXRhIHVudHVrIG1lbWlsaWggbG9rYXNpIGNlcml0YVwiPjwvZGl2PlxyXG4gICAgICAgICAgPHAgaWQ9XCJsb2NhdGlvbi1pbmZvXCIgYXJpYS1saXZlPVwicG9saXRlXCI+QmVsdW0gYWRhIGxva2FzaSBkaXBpbGloLjwvcD5cclxuICAgICAgICA8L2Rpdj5cclxuXHJcbiAgICAgICAgPGJ1dHRvbiBcclxuICAgICAgICAgIHR5cGU9XCJzdWJtaXRcIiBcclxuICAgICAgICAgIGNsYXNzPVwiYnRuLXN1Ym1pdFwiXHJcbiAgICAgICAgICBhcmlhLWxhYmVsPVwiS2lyaW0gQ2VyaXRhXCJcclxuICAgICAgICA+XHJcbiAgICAgICAgICBLaXJpbSBDZXJpdGFcclxuICAgICAgICA8L2J1dHRvbj5cclxuICAgICAgPC9mb3JtPlxyXG4gICAgYDtcclxuXHJcbiAgICAvLyBQYXN0aWthbiBwZXRhIGRpaW5pc2lhbGlzYXNpIHNldGVsYWggZWxlbWVuIGRpbWFzdWtrYW4ga2UgRE9NXHJcbiAgICBzZXRUaW1lb3V0KCgpID0+IHRoaXMuaW5pdE1hcCgpLCAxMDApO1xyXG4gICAgcmV0dXJuIGRpdjtcclxuICB9XHJcblxyXG4gIGFzeW5jIGluaXRNYXAoKSB7XHJcbiAgICBjb25zdCBtYXBDb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcIm1hcFwiKTtcclxuICAgIGlmICghbWFwQ29udGFpbmVyKSByZXR1cm47XHJcblxyXG4gICAgY29uc3QgbWFwID0gTC5tYXAoXCJtYXBcIikuc2V0VmlldyhbLTIuNTQ4OSwgMTE4LjAxNDldLCA1KTtcclxuXHJcbiAgICBMLnRpbGVMYXllcihcImh0dHBzOi8ve3N9LnRpbGUub3BlbnN0cmVldG1hcC5vcmcve3p9L3t4fS97eX0ucG5nXCIsIHtcclxuICAgICAgbWF4Wm9vbTogMTgsXHJcbiAgICB9KS5hZGRUbyhtYXApO1xyXG5cclxuICAgIGxldCBtYXJrZXI7XHJcbiAgICBjb25zdCBsb2NhdGlvbkluZm8gPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImxvY2F0aW9uLWluZm9cIik7XHJcblxyXG4gICAgbWFwLm9uKFwiY2xpY2tcIiwgKGUpID0+IHtcclxuICAgICAgY29uc3QgeyBsYXQsIGxuZyB9ID0gZS5sYXRsbmc7XHJcblxyXG4gICAgICBpZiAobWFya2VyKSBtYXAucmVtb3ZlTGF5ZXIobWFya2VyKTtcclxuICAgICAgbWFya2VyID0gTC5tYXJrZXIoW2xhdCwgbG5nXSkuYWRkVG8obWFwKTtcclxuXHJcbiAgICAgIGxvY2F0aW9uSW5mby50ZXh0Q29udGVudCA9IGBMb2thc2kgZGlwaWxpaDogJHtsYXQudG9GaXhlZCg1KX0sICR7bG5nLnRvRml4ZWQoNSl9YDtcclxuICAgICAgbG9jYXRpb25JbmZvLmRhdGFzZXQubGF0ID0gbGF0O1xyXG4gICAgICBsb2NhdGlvbkluZm8uZGF0YXNldC5sbmcgPSBsbmc7XHJcbiAgICB9KTtcclxuXHJcbiAgICAvLyBUYW5nYW5pIHN1Ym1pdCBmb3JtXHJcbiAgICBjb25zdCBmb3JtID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJhZGRTdG9yeUZvcm1cIik7XHJcbiAgICBmb3JtLmFkZEV2ZW50TGlzdGVuZXIoXCJzdWJtaXRcIiwgYXN5bmMgKGUpID0+IHtcclxuICAgICAgZS5wcmV2ZW50RGVmYXVsdCgpO1xyXG5cclxuICAgICAgY29uc3QgZm9ybURhdGEgPSBuZXcgRm9ybURhdGEoZm9ybSk7XHJcbiAgICAgIGNvbnN0IGxhdCA9IGxvY2F0aW9uSW5mby5kYXRhc2V0LmxhdDtcclxuICAgICAgY29uc3QgbG9uID0gbG9jYXRpb25JbmZvLmRhdGFzZXQubG5nO1xyXG5cclxuICAgICAgaWYgKCFsYXQgfHwgIWxvbikge1xyXG4gICAgICAgIGFsZXJ0KFwiU2lsYWthbiBwaWxpaCBsb2thc2kgZGkgcGV0YSB0ZXJsZWJpaCBkYWh1bHUhXCIpO1xyXG4gICAgICAgIHJldHVybjtcclxuICAgICAgfVxyXG5cclxuICAgICAgZm9ybURhdGEuYXBwZW5kKFwibGF0XCIsIGxhdCk7XHJcbiAgICAgIGZvcm1EYXRhLmFwcGVuZChcImxvblwiLCBsb24pO1xyXG5cclxuICAgICAgLy8gVHJ5IHRvIHN1Ym1pdCBvbmxpbmUgZmlyc3RcclxuICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYXBpTW9kZWwuYWRkU3RvcnkoZm9ybURhdGEpO1xyXG5cclxuICAgICAgaWYgKHJlc3VsdC5lcnJvcikge1xyXG4gICAgICAgIC8vIElmIG9ubGluZSBzdWJtaXNzaW9uIGZhaWxzLCBzYXZlIG9mZmxpbmVcclxuICAgICAgICBpZiAoIW5hdmlnYXRvci5vbkxpbmUpIHtcclxuICAgICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGNvbnN0IHsgZmF2b3JpdGVEQiB9ID0gYXdhaXQgaW1wb3J0KFwiLi4vZGIvZmF2b3JpdGUtZGIuanNcIik7XHJcbiAgICAgICAgICAgIGF3YWl0IGZhdm9yaXRlREIuYWRkT2ZmbGluZVN0b3J5KGZvcm1EYXRhKTtcclxuICAgICAgICAgICAgYWxlcnQoXCLwn5OxIENlcml0YSBkaXNpbXBhbiBvZmZsaW5lLiBBa2FuIGRpc2lua3JvbmthbiBzYWF0IG9ubGluZS5cIik7XHJcbiAgICAgICAgICAgIHdpbmRvdy5sb2NhdGlvbi5oYXNoID0gXCIvXCI7XHJcbiAgICAgICAgICB9IGNhdGNoIChvZmZsaW5lRXJyKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCLinYwgR2FnYWwgbWVueWltcGFuIG9mZmxpbmU6XCIsIG9mZmxpbmVFcnIpO1xyXG4gICAgICAgICAgICBhbGVydChcIuKdjCBHYWdhbCBtZW5hbWJhaGthbiBjZXJpdGEgZGFuIHRpZGFrIGRhcGF0IG1lbnlpbXBhbiBvZmZsaW5lLlwiKTtcclxuICAgICAgICAgIH1cclxuICAgICAgICB9IGVsc2Uge1xyXG4gICAgICAgICAgYWxlcnQoXCLinYwgR2FnYWwgbWVuYW1iYWhrYW4gY2VyaXRhOiBcIiArIHJlc3VsdC5tZXNzYWdlKTtcclxuICAgICAgICB9XHJcbiAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgYWxlcnQoXCLinIUgQ2VyaXRhIGJlcmhhc2lsIGRpdGFtYmFoa2FuIVwiKTtcclxuICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiIy9tYXBcIjtcclxuICAgICAgfVxyXG4gICAgfSk7XHJcbiAgfVxyXG59XHJcbiIsImltcG9ydCB7IGZhdm9yaXRlREIgfSBmcm9tIFwiLi4vZGIvZmF2b3JpdGUtZGIuanNcIjtcclxuaW1wb3J0IHsgYXBpTW9kZWwgfSBmcm9tIFwiLi4vbW9kZWxzL2FwaU1vZGVsLmpzXCI7XHJcblxyXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBGYXZvcml0ZXNWaWV3IHtcclxuICAgIGNvbnN0cnVjdG9yKCkge1xyXG4gICAgICAgIHRoaXMuZmF2b3JpdGVzID0gW107XHJcbiAgICAgICAgdGhpcy5maWx0ZXJlZEZhdm9yaXRlcyA9IFtdO1xyXG4gICAgICAgIHRoaXMuc2VhcmNoUXVlcnkgPSBcIlwiO1xyXG4gICAgICAgIHRoaXMuc29ydE9yZGVyID0gXCJkZXNjXCI7IC8vIGRlc2Mgb3IgYXNjXHJcbiAgICAgICAgdGhpcy5zb3J0QnkgPSBcImRhdGVcIjsgLy8gZGF0ZSBvciBuYW1lXHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyKCkge1xyXG4gICAgICAgIGNvbnN0IGRpdiA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJkaXZcIik7XHJcbiAgICAgICAgZGl2LmNsYXNzTmFtZSA9IFwicGFnZSBwYWdlLWZhdm9yaXRlc1wiO1xyXG4gICAgICAgIGRpdi5zZXRBdHRyaWJ1dGUoXCJyb2xlXCIsIFwicmVnaW9uXCIpO1xyXG4gICAgICAgIGRpdi5zZXRBdHRyaWJ1dGUoXCJhcmlhLWxhYmVsbGVkYnlcIiwgXCJmYXZvcml0ZXMtdGl0bGVcIik7XHJcblxyXG4gICAgICAgIGRpdi5pbm5lckhUTUwgPSBgXHJcbiAgICAgICAgICAgIDxoMSBpZD1cImZhdm9yaXRlcy10aXRsZVwiIGNsYXNzPVwicGFnZS10aXRsZVwiIHRhYmluZGV4PVwiMFwiPk15IEZhdm9yaXRlczwvaDE+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZmF2b3JpdGVzLWNvbnRyb2xzXCI+XHJcbiAgICAgICAgICAgICAgICA8ZGl2IGNsYXNzPVwic2VhcmNoLWNvbnRhaW5lclwiPlxyXG4gICAgICAgICAgICAgICAgICAgIDxpbnB1dFxyXG4gICAgICAgICAgICAgICAgICAgICAgICB0eXBlPVwidGV4dFwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGlkPVwic2VhcmNoLWZhdm9yaXRlc1wiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIHBsYWNlaG9sZGVyPVwiU2VhcmNoIGZhdm9yaXRlcy4uLlwiXHJcbiAgICAgICAgICAgICAgICAgICAgICAgIGFyaWEtbGFiZWw9XCJTZWFyY2ggZmF2b3JpdGVzXCJcclxuICAgICAgICAgICAgICAgICAgICA+XHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBpZD1cImNsZWFyLXNlYXJjaFwiIGNsYXNzPVwiYnRuLWNsZWFyXCI+Q2xlYXI8L2J1dHRvbj5cclxuICAgICAgICAgICAgICAgIDwvZGl2PlxyXG5cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJzb3J0LWNvbnRyb2xzXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgPGxhYmVsIGZvcj1cInNvcnQtYnlcIj5Tb3J0IGJ5OjwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgPHNlbGVjdCBpZD1cInNvcnQtYnlcIiBhcmlhLWxhYmVsPVwiU29ydCBmYXZvcml0ZXMgYnlcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgPG9wdGlvbiB2YWx1ZT1cImRhdGVcIj5EYXRlPC9vcHRpb24+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIDxvcHRpb24gdmFsdWU9XCJuYW1lXCI+TmFtZTwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgIDwvc2VsZWN0PlxyXG5cclxuICAgICAgICAgICAgICAgICAgICA8bGFiZWwgZm9yPVwic29ydC1vcmRlclwiPk9yZGVyOjwvbGFiZWw+XHJcbiAgICAgICAgICAgICAgICAgICAgPHNlbGVjdCBpZD1cInNvcnQtb3JkZXJcIiBhcmlhLWxhYmVsPVwiU29ydCBvcmRlclwiPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiZGVzY1wiPk5ld2VzdCBGaXJzdDwvb3B0aW9uPlxyXG4gICAgICAgICAgICAgICAgICAgICAgICA8b3B0aW9uIHZhbHVlPVwiYXNjXCI+T2xkZXN0IEZpcnN0PC9vcHRpb24+XHJcbiAgICAgICAgICAgICAgICAgICAgPC9zZWxlY3Q+XHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgPC9kaXY+XHJcblxyXG4gICAgICAgICAgICA8ZGl2IGlkPVwiZmF2b3JpdGVzLWxpc3RcIiBjbGFzcz1cImZhdm9yaXRlcy1saXN0XCIgcm9sZT1cImxpc3RcIiBhcmlhLWxhYmVsPVwiTGlzdCBvZiBmYXZvcml0ZSBzdG9yaWVzXCI+XHJcbiAgICAgICAgICAgICAgICA8cCBjbGFzcz1cImxvYWRpbmdcIj5Mb2FkaW5nIGZhdm9yaXRlcy4uLjwvcD5cclxuICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgYDtcclxuXHJcbiAgICAgICAgcmV0dXJuIGRpdjtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBhZnRlclJlbmRlcigpIHtcclxuICAgICAgICBhd2FpdCB0aGlzLmxvYWRGYXZvcml0ZXMoKTtcclxuXHJcbiAgICAgICAgLy8gU2VhcmNoIGZ1bmN0aW9uYWxpdHlcclxuICAgICAgICBjb25zdCBzZWFyY2hJbnB1dCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic2VhcmNoLWZhdm9yaXRlc1wiKTtcclxuICAgICAgICBjb25zdCBjbGVhckJ0biA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwiY2xlYXItc2VhcmNoXCIpO1xyXG4gICAgICAgIGNvbnN0IHNvcnRCeVNlbGVjdCA9IGRvY3VtZW50LmdldEVsZW1lbnRCeUlkKFwic29ydC1ieVwiKTtcclxuICAgICAgICBjb25zdCBzb3J0T3JkZXJTZWxlY3QgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcInNvcnQtb3JkZXJcIik7XHJcblxyXG4gICAgICAgIHNlYXJjaElucHV0LmFkZEV2ZW50TGlzdGVuZXIoXCJpbnB1dFwiLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICB0aGlzLnNlYXJjaFF1ZXJ5ID0gZS50YXJnZXQudmFsdWUudG9Mb3dlckNhc2UoKTtcclxuICAgICAgICAgICAgdGhpcy5hcHBseUZpbHRlcnMoKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgY2xlYXJCdG4uYWRkRXZlbnRMaXN0ZW5lcihcImNsaWNrXCIsICgpID0+IHtcclxuICAgICAgICAgICAgc2VhcmNoSW5wdXQudmFsdWUgPSBcIlwiO1xyXG4gICAgICAgICAgICB0aGlzLnNlYXJjaFF1ZXJ5ID0gXCJcIjtcclxuICAgICAgICAgICAgdGhpcy5hcHBseUZpbHRlcnMoKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgc29ydEJ5U2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKGUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5zb3J0QnkgPSBlLnRhcmdldC52YWx1ZTtcclxuICAgICAgICAgICAgdGhpcy5hcHBseUZpbHRlcnMoKTtcclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgc29ydE9yZGVyU2VsZWN0LmFkZEV2ZW50TGlzdGVuZXIoXCJjaGFuZ2VcIiwgKGUpID0+IHtcclxuICAgICAgICAgICAgdGhpcy5zb3J0T3JkZXIgPSBlLnRhcmdldC52YWx1ZTtcclxuICAgICAgICAgICAgdGhpcy5hcHBseUZpbHRlcnMoKTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyBsb2FkRmF2b3JpdGVzKCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIHRoaXMuZmF2b3JpdGVzID0gYXdhaXQgZmF2b3JpdGVEQi5nZXRBbGxGYXZvcml0ZXMoKTtcclxuICAgICAgICAgICAgdGhpcy5hcHBseUZpbHRlcnMoKTtcclxuICAgICAgICB9IGNhdGNoIChlcnJvcikge1xyXG4gICAgICAgICAgICBjb25zb2xlLmVycm9yKFwiRXJyb3IgbG9hZGluZyBmYXZvcml0ZXM6XCIsIGVycm9yKTtcclxuICAgICAgICAgICAgdGhpcy5zaG93RXJyb3IoXCJGYWlsZWQgdG8gbG9hZCBmYXZvcml0ZXNcIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIGFwcGx5RmlsdGVycygpIHtcclxuICAgICAgICBsZXQgZmlsdGVyZWQgPSBbLi4udGhpcy5mYXZvcml0ZXNdO1xyXG5cclxuICAgICAgICAvLyBBcHBseSBzZWFyY2ggYnkgbmFtZSBvbmx5XHJcbiAgICAgICAgaWYgKHRoaXMuc2VhcmNoUXVlcnkpIHtcclxuICAgICAgICAgICAgZmlsdGVyZWQgPSBmaWx0ZXJlZC5maWx0ZXIoc3RvcnkgPT5cclxuICAgICAgICAgICAgICAgIHN0b3J5Lm5hbWUudG9Mb3dlckNhc2UoKS5pbmNsdWRlcyh0aGlzLnNlYXJjaFF1ZXJ5KVxyXG4gICAgICAgICAgICApO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgLy8gQXBwbHkgc29ydGluZ1xyXG4gICAgICAgIGlmICh0aGlzLnNvcnRCeSA9PT0gXCJkYXRlXCIpIHtcclxuICAgICAgICAgICAgZmlsdGVyZWQuc29ydCgoYSwgYikgPT4ge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgZGF0ZUEgPSBuZXcgRGF0ZShhLmNyZWF0ZWRBdCB8fCAwKTtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGRhdGVCID0gbmV3IERhdGUoYi5jcmVhdGVkQXQgfHwgMCk7XHJcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zb3J0T3JkZXIgPT09IFwiZGVzY1wiID8gZGF0ZUIgLSBkYXRlQSA6IGRhdGVBIC0gZGF0ZUI7XHJcbiAgICAgICAgICAgIH0pO1xyXG4gICAgICAgIH0gZWxzZSBpZiAodGhpcy5zb3J0QnkgPT09IFwibmFtZVwiKSB7XHJcbiAgICAgICAgICAgIGZpbHRlcmVkLnNvcnQoKGEsIGIpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IG5hbWVBID0gYS5uYW1lLnRvTG93ZXJDYXNlKCk7XHJcbiAgICAgICAgICAgICAgICBjb25zdCBuYW1lQiA9IGIubmFtZS50b0xvd2VyQ2FzZSgpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHRoaXMuc29ydE9yZGVyID09PSBcImFzY1wiKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5hbWVBIDwgbmFtZUIgPyAtMSA6IG5hbWVBID4gbmFtZUIgPyAxIDogMDtcclxuICAgICAgICAgICAgICAgIH0gZWxzZSB7XHJcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG5hbWVBID4gbmFtZUIgPyAtMSA6IG5hbWVBIDwgbmFtZUIgPyAxIDogMDtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSk7XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICB0aGlzLmZpbHRlcmVkRmF2b3JpdGVzID0gZmlsdGVyZWQ7XHJcbiAgICAgICAgdGhpcy5yZW5kZXJGYXZvcml0ZXNMaXN0KCk7XHJcbiAgICB9XHJcblxyXG4gICAgcmVuZGVyRmF2b3JpdGVzTGlzdCgpIHtcclxuICAgICAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImZhdm9yaXRlcy1saXN0XCIpO1xyXG5cclxuICAgICAgICBpZiAodGhpcy5maWx0ZXJlZEZhdm9yaXRlcy5sZW5ndGggPT09IDApIHtcclxuICAgICAgICAgICAgaWYgKHRoaXMuZmF2b3JpdGVzLmxlbmd0aCA9PT0gMCkge1xyXG4gICAgICAgICAgICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9ICc8cCBjbGFzcz1cImVtcHR5LXN0YXRlXCI+Tm8gZmF2b3JpdGVzIHlldC4gQWRkIHNvbWUgc3RvcmllcyB0byB5b3VyIGZhdm9yaXRlcyE8L3A+JztcclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbnRhaW5lci5pbm5lckhUTUwgPSAnPHAgY2xhc3M9XCJlbXB0eS1zdGF0ZVwiPk5vIGZhdm9yaXRlcyBtYXRjaCB5b3VyIHNlYXJjaC48L3A+JztcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICByZXR1cm47XHJcbiAgICAgICAgfVxyXG5cclxuICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gdGhpcy5maWx0ZXJlZEZhdm9yaXRlcy5tYXAoc3RvcnkgPT4gYFxyXG4gICAgICAgICAgICA8ZGl2IGNsYXNzPVwiZmF2b3JpdGUtaXRlbVwiIHJvbGU9XCJsaXN0aXRlbVwiIGRhdGEtaWQ9XCIke3N0b3J5LmlkfVwiPlxyXG4gICAgICAgICAgICAgICAgPGltZyBcclxuICAgICAgICAgICAgICAgICAgICBzcmM9XCIke3RoaXMuZXNjYXBlSHRtbChzdG9yeS5waG90b1VybCl9XCIgXHJcbiAgICAgICAgICAgICAgICAgICAgYWx0PVwiRm90byBmYXZvcml0ICR7dGhpcy5lc2NhcGVIdG1sKHN0b3J5Lm5hbWUpfVwiIFxyXG4gICAgICAgICAgICAgICAgICAgIGNsYXNzPVwiZmF2b3JpdGUtaW1nXCIgXHJcbiAgICAgICAgICAgICAgICAgICAgbG9hZGluZz1cImxhenlcIlxyXG4gICAgICAgICAgICAgICAgLz5cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJmYXZvcml0ZS1jb250ZW50XCI+XHJcbiAgICAgICAgICAgICAgICAgICAgPGgzIGNsYXNzPVwiZmF2b3JpdGUtdGl0bGVcIj4ke3RoaXMuZXNjYXBlSHRtbChzdG9yeS5uYW1lKX08L2gzPlxyXG4gICAgICAgICAgICAgICAgICAgIDxwIGNsYXNzPVwiZmF2b3JpdGUtZGVzY3JpcHRpb25cIj4ke3RoaXMuZXNjYXBlSHRtbChzdG9yeS5kZXNjcmlwdGlvbil9PC9wPlxyXG4gICAgICAgICAgICAgICAgICAgIDxzbWFsbCBjbGFzcz1cImZhdm9yaXRlLWRhdGVcIj5cclxuICAgICAgICAgICAgICAgICAgICAgICAgQ3JlYXRlZDogJHtuZXcgRGF0ZShzdG9yeS5jcmVhdGVkQXQpLnRvTG9jYWxlRGF0ZVN0cmluZygpfVxyXG4gICAgICAgICAgICAgICAgICAgIDwvc21hbGw+XHJcbiAgICAgICAgICAgICAgICA8L2Rpdj5cclxuICAgICAgICAgICAgICAgIDxkaXYgY2xhc3M9XCJmYXZvcml0ZS1hY3Rpb25zXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgPGJ1dHRvbiBjbGFzcz1cImJ0bi1yZW1vdmUtZmF2b3JpdGVcIiBkYXRhLWlkPVwiJHtzdG9yeS5pZH1cIiBhcmlhLWxhYmVsPVwiUmVtb3ZlIGZyb20gZmF2b3JpdGVzXCI+XHJcbiAgICAgICAgICAgICAgICAgICAgICAgIFJlbW92ZVxyXG4gICAgICAgICAgICAgICAgICAgIDwvYnV0dG9uPlxyXG4gICAgICAgICAgICAgICAgPC9kaXY+XHJcbiAgICAgICAgICAgIDwvZGl2PlxyXG4gICAgICAgIGApLmpvaW4oXCJcIik7XHJcblxyXG4gICAgICAgIC8vIEFkZCBldmVudCBsaXN0ZW5lcnMgZm9yIHJlbW92ZSBidXR0b25zXHJcbiAgICAgICAgY29udGFpbmVyLnF1ZXJ5U2VsZWN0b3JBbGwoXCIuYnRuLXJlbW92ZS1mYXZvcml0ZVwiKS5mb3JFYWNoKGJ0biA9PiB7XHJcbiAgICAgICAgICAgIGJ0bi5hZGRFdmVudExpc3RlbmVyKFwiY2xpY2tcIiwgYXN5bmMgKGUpID0+IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IGlkID0gZS50YXJnZXQuZGF0YXNldC5pZDtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHRoaXMucmVtb3ZlRmF2b3JpdGUoaWQpO1xyXG4gICAgICAgICAgICB9KTtcclxuICAgICAgICB9KTtcclxuICAgIH1cclxuXHJcbiAgICBhc3luYyByZW1vdmVGYXZvcml0ZShpZCkge1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGF3YWl0IGZhdm9yaXRlREIuZGVsZXRlRmF2b3JpdGUoaWQpO1xyXG4gICAgICAgICAgICBhd2FpdCB0aGlzLmxvYWRGYXZvcml0ZXMoKTsgLy8gUmVsb2FkIHRoZSBsaXN0XHJcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKFwiRmF2b3JpdGUgcmVtb3ZlZDpcIiwgaWQpO1xyXG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJFcnJvciByZW1vdmluZyBmYXZvcml0ZTpcIiwgZXJyb3IpO1xyXG4gICAgICAgICAgICBhbGVydChcIkZhaWxlZCB0byByZW1vdmUgZmF2b3JpdGVcIik7XHJcbiAgICAgICAgfVxyXG4gICAgfVxyXG5cclxuICAgIHNob3dFcnJvcihtZXNzYWdlKSB7XHJcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJmYXZvcml0ZXMtbGlzdFwiKTtcclxuICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gYDxwIGNsYXNzPVwiZXJyb3Itc3RhdGVcIj4ke21lc3NhZ2V9PC9wPmA7XHJcbiAgICB9XHJcblxyXG4gICAgZXNjYXBlSHRtbCh0ZXh0KSB7XHJcbiAgICAgICAgY29uc3QgZGl2ID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnZGl2Jyk7XHJcbiAgICAgICAgZGl2LnRleHRDb250ZW50ID0gdGV4dDtcclxuICAgICAgICByZXR1cm4gZGl2LmlubmVySFRNTDtcclxuICAgIH1cclxufVxyXG4iLCJpbXBvcnQgeyBhcGlNb2RlbCB9IGZyb20gXCIuLi9tb2RlbHMvYXBpTW9kZWwuanNcIjtcclxuXHJcbmNsYXNzIExvZ2luUGFnZSB7XHJcbiAgICBhc3luYyByZW5kZXIoKSB7XHJcbiAgICAgICAgY29uc3QgY29udGFpbmVyID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcInNlY3Rpb25cIik7XHJcbiAgICAgICAgY29udGFpbmVyLmNsYXNzTGlzdC5hZGQoXCJhdXRoLXNlY3Rpb25cIik7XHJcbiAgICAgICAgY29udGFpbmVyLmlubmVySFRNTCA9IGBcclxuICAgICAgPGgyPkxvZ2luPC9oMj5cclxuICAgICAgPGZvcm0gaWQ9XCJsb2dpbkZvcm1cIiBjbGFzcz1cImF1dGgtZm9ybVwiPlxyXG4gICAgICAgIDxpbnB1dCB0eXBlPVwiZW1haWxcIiBpZD1cImVtYWlsXCIgbmFtZT1cImVtYWlsXCIgcGxhY2Vob2xkZXI9XCJFbWFpbFwiIHJlcXVpcmVkIC8+XHJcbiAgICAgICAgPGlucHV0IHR5cGU9XCJwYXNzd29yZFwiIGlkPVwicGFzc3dvcmRcIiBuYW1lPVwicGFzc3dvcmRcIiBwbGFjZWhvbGRlcj1cIlBhc3N3b3JkXCIgcmVxdWlyZWQgLz5cclxuICAgICAgICA8YnV0dG9uIHR5cGU9XCJzdWJtaXRcIj5Mb2dpbjwvYnV0dG9uPlxyXG4gICAgICA8L2Zvcm0+XHJcbiAgICAgIDxwPkJlbHVtIHB1bnlhIGFrdW4/IDxhIGhyZWY9XCIjL3JlZ2lzdGVyXCI+RGFmdGFyIGRpIHNpbmk8L2E+PC9wPlxyXG4gICAgYDtcclxuICAgICAgICByZXR1cm4gY29udGFpbmVyO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGFmdGVyUmVuZGVyKCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwi4pyFIExvZ2luUGFnZS5hZnRlclJlbmRlcigpIHRlcnBhbmdnaWwhXCIpO1xyXG5cclxuICAgICAgICBjb25zdCBmb3JtID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJsb2dpbkZvcm1cIik7XHJcbiAgICAgICAgaWYgKCFmb3JtKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCLinYwgRWxlbWVuIGZvcm0gbG9naW4gdGlkYWsgZGl0ZW11a2FuIVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9ybS5hZGRFdmVudExpc3RlbmVyKFwic3VibWl0XCIsIGFzeW5jIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFtYmlsIG5pbGFpIGlucHV0IHNlY2FyYSBhbWFuXHJcbiAgICAgICAgICAgIGNvbnN0IGVtYWlsID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNlbWFpbFwiKS52YWx1ZS50cmltKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHBhc3N3b3JkID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNwYXNzd29yZFwiKS52YWx1ZS50cmltKCk7XHJcblxyXG4gICAgICAgICAgICBpZiAoIWVtYWlsIHx8ICFwYXNzd29yZCkge1xyXG4gICAgICAgICAgICAgICAgYWxlcnQoXCJFbWFpbCBkYW4gcGFzc3dvcmQgd2FqaWIgZGlpc2khXCIpO1xyXG4gICAgICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgICAgICB9XHJcblxyXG4gICAgICAgICAgICAvLyBGZWVkYmFjayBsb2FkaW5nXHJcbiAgICAgICAgICAgIGNvbnN0IGJ1dHRvbiA9IGZvcm0ucXVlcnlTZWxlY3RvcihcImJ1dHRvblwiKTtcclxuICAgICAgICAgICAgYnV0dG9uLmRpc2FibGVkID0gdHJ1ZTtcclxuICAgICAgICAgICAgYnV0dG9uLnRleHRDb250ZW50ID0gXCJNYXN1ay4uLlwiO1xyXG5cclxuICAgICAgICAgICAgdHJ5IHtcclxuICAgICAgICAgICAgICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGFwaU1vZGVsLmxvZ2luKGVtYWlsLCBwYXNzd29yZCk7XHJcblxyXG4gICAgICAgICAgICAgICAgYWxlcnQocmVzdWx0Lm1lc3NhZ2UpO1xyXG4gICAgICAgICAgICAgICAgaWYgKHJlc3VsdC5zdWNjZXNzKSB7XHJcbiAgICAgICAgICAgICAgICAgICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSBcIiMvXCI7IC8vIGFyYWhrYW4ga2UgaGFsYW1hbiB1dGFtYVxyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCLimqDvuI8gVGVyamFkaSBrZXNhbGFoYW4gc2FhdCBsb2dpbjpcIiwgZXJyKTtcclxuICAgICAgICAgICAgICAgIGFsZXJ0KFwiVGVyamFkaSBrZXNhbGFoYW4uIENvYmEgbGFnaSBuYW50aS5cIik7XHJcbiAgICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgICAgICBidXR0b24uZGlzYWJsZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9IFwiTG9naW5cIjtcclxuICAgICAgICAgICAgfVxyXG4gICAgICAgIH0pO1xyXG4gICAgfVxyXG59XHJcblxyXG5leHBvcnQgZGVmYXVsdCBMb2dpblBhZ2U7XHJcbiIsImltcG9ydCB7IGFwaU1vZGVsIH0gZnJvbSBcIi4uL21vZGVscy9hcGlNb2RlbC5qc1wiO1xyXG5cclxuY2xhc3MgUmVnaXN0ZXJQYWdlIHtcclxuICAgIGFzeW5jIHJlbmRlcigpIHtcclxuICAgICAgICBjb25zdCBjb250YWluZXIgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwic2VjdGlvblwiKTtcclxuICAgICAgICBjb250YWluZXIuY2xhc3NMaXN0LmFkZChcImF1dGgtc2VjdGlvblwiKTtcclxuICAgICAgICBjb250YWluZXIuaW5uZXJIVE1MID0gYFxyXG4gICAgICA8aDI+UmVnaXN0ZXI8L2gyPlxyXG4gICAgICA8Zm9ybSBpZD1cInJlZ2lzdGVyRm9ybVwiIGNsYXNzPVwiYXV0aC1mb3JtXCI+XHJcbiAgICAgICAgPGlucHV0IHR5cGU9XCJ0ZXh0XCIgaWQ9XCJuYW1lXCIgbmFtZT1cIm5hbWVcIiBwbGFjZWhvbGRlcj1cIk5hbWEgTGVuZ2thcFwiIHJlcXVpcmVkIC8+XHJcbiAgICAgICAgPGlucHV0IHR5cGU9XCJlbWFpbFwiIGlkPVwiZW1haWxcIiBuYW1lPVwiZW1haWxcIiBwbGFjZWhvbGRlcj1cIkVtYWlsXCIgcmVxdWlyZWQgLz5cclxuICAgICAgICA8aW5wdXQgdHlwZT1cInBhc3N3b3JkXCIgaWQ9XCJwYXNzd29yZFwiIG5hbWU9XCJwYXNzd29yZFwiIHBsYWNlaG9sZGVyPVwiUGFzc3dvcmRcIiByZXF1aXJlZCBtaW5sZW5ndGg9XCI4XCIgLz5cclxuICAgICAgICA8YnV0dG9uIHR5cGU9XCJzdWJtaXRcIj5EYWZ0YXI8L2J1dHRvbj5cclxuICAgICAgPC9mb3JtPlxyXG4gICAgICA8cD5TdWRhaCBwdW55YSBha3VuPyA8YSBocmVmPVwiIy9sb2dpblwiPkxvZ2luIGRpIHNpbmk8L2E+PC9wPlxyXG4gICAgYDtcclxuICAgICAgICByZXR1cm4gY29udGFpbmVyO1xyXG4gICAgfVxyXG5cclxuICAgIGFzeW5jIGFmdGVyUmVuZGVyKCkge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwi4pyFIFJlZ2lzdGVyUGFnZS5hZnRlclJlbmRlcigpIHRlcnBhbmdnaWwhXCIpO1xyXG5cclxuICAgICAgICBjb25zdCBmb3JtID0gZG9jdW1lbnQuZ2V0RWxlbWVudEJ5SWQoXCJyZWdpc3RlckZvcm1cIik7XHJcbiAgICAgICAgaWYgKCFmb3JtKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCLinYwgRWxlbWVuIGZvcm0gdGlkYWsgZGl0ZW11a2FuIVwiKTtcclxuICAgICAgICAgICAgcmV0dXJuO1xyXG4gICAgICAgIH1cclxuXHJcbiAgICAgICAgZm9ybS5hZGRFdmVudExpc3RlbmVyKFwic3VibWl0XCIsIGFzeW5jIChlKSA9PiB7XHJcbiAgICAgICAgICAgIGUucHJldmVudERlZmF1bHQoKTtcclxuXHJcbiAgICAgICAgICAgIC8vIEFtYmlsIG5pbGFpIGlucHV0IGRlbmdhbiBjYXJhIHlhbmcgYW1hblxyXG4gICAgICAgICAgICBjb25zdCBuYW1lID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIiNuYW1lXCIpLnZhbHVlLnRyaW0oKTtcclxuICAgICAgICAgICAgY29uc3QgZW1haWwgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI2VtYWlsXCIpLnZhbHVlLnRyaW0oKTtcclxuICAgICAgICAgICAgY29uc3QgcGFzc3dvcmQgPSBkb2N1bWVudC5xdWVyeVNlbGVjdG9yKFwiI3Bhc3N3b3JkXCIpLnZhbHVlLnRyaW0oKTtcclxuXHJcbiAgICAgICAgICAgIGlmICghbmFtZSB8fCAhZW1haWwgfHwgIXBhc3N3b3JkKSB7XHJcbiAgICAgICAgICAgICAgICBhbGVydChcIlNlbXVhIGtvbG9tIHdhamliIGRpaXNpIVwiKTtcclxuICAgICAgICAgICAgICAgIHJldHVybjtcclxuICAgICAgICAgICAgfVxyXG5cclxuICAgICAgICAgICAgLy8gVGFtcGlsa2FuIGluZGlrYXRvciBsb2FkaW5nIHNlZGVyaGFuYVxyXG4gICAgICAgICAgICBjb25zdCBidXR0b24gPSBmb3JtLnF1ZXJ5U2VsZWN0b3IoXCJidXR0b25cIik7XHJcbiAgICAgICAgICAgIGJ1dHRvbi5kaXNhYmxlZCA9IHRydWU7XHJcbiAgICAgICAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9IFwiTWVuZGFmdGFyLi4uXCI7XHJcblxyXG4gICAgICAgICAgICB0cnkge1xyXG4gICAgICAgICAgICAgICAgY29uc3QgcmVzdWx0ID0gYXdhaXQgYXBpTW9kZWwucmVnaXN0ZXIobmFtZSwgZW1haWwsIHBhc3N3b3JkKTtcclxuXHJcbiAgICAgICAgICAgICAgICBhbGVydChyZXN1bHQubWVzc2FnZSk7XHJcbiAgICAgICAgICAgICAgICBpZiAocmVzdWx0LnN1Y2Nlc3MpIHtcclxuICAgICAgICAgICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiIy9sb2dpblwiO1xyXG4gICAgICAgICAgICAgICAgfVxyXG4gICAgICAgICAgICB9IGNhdGNoIChlcnIpIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCLimqDvuI8gVGVyamFkaSBrZXNhbGFoYW4gc2FhdCByZWdpc3RlcjpcIiwgZXJyKTtcclxuICAgICAgICAgICAgICAgIGFsZXJ0KFwiVGVyamFkaSBrZXNhbGFoYW4uIENvYmEgbGFnaSBuYW50aS5cIik7XHJcbiAgICAgICAgICAgIH0gZmluYWxseSB7XHJcbiAgICAgICAgICAgICAgICBidXR0b24uZGlzYWJsZWQgPSBmYWxzZTtcclxuICAgICAgICAgICAgICAgIGJ1dHRvbi50ZXh0Q29udGVudCA9IFwiRGFmdGFyXCI7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuICAgIH1cclxufVxyXG5cclxuZXhwb3J0IGRlZmF1bHQgUmVnaXN0ZXJQYWdlO1xyXG4iLCJpbXBvcnQgeyBQYWdlUHJlc2VudGVyIH0gZnJvbSBcIi4vcHJlc2VudGVycy9wYWdlUHJlc2VudGVyLmpzXCI7XHJcbmltcG9ydCBIb21lVmlldyBmcm9tIFwiLi92aWV3cy9ob21lVmlldy5qc1wiO1xyXG5pbXBvcnQgQWJvdXRWaWV3IGZyb20gXCIuL3ZpZXdzL2Fib3V0Vmlldy5qc1wiO1xyXG5pbXBvcnQgQ29udGFjdFZpZXcgZnJvbSBcIi4vdmlld3MvY29udGFjdFZpZXcuanNcIjtcclxuaW1wb3J0IE1hcFZpZXcgZnJvbSBcIi4vdmlld3MvbWFwVmlldy5qc1wiO1xyXG5pbXBvcnQgQWRkU3RvcnlWaWV3IGZyb20gXCIuL3ZpZXdzL2FkZHN0b3J5Vmlldy5qc1wiO1xyXG5pbXBvcnQgRmF2b3JpdGVzVmlldyBmcm9tIFwiLi92aWV3cy9mYXZvcml0ZXNWaWV3LmpzXCI7XHJcbmltcG9ydCBMb2dpblBhZ2UgZnJvbSBcIi4vdmlld3MvbG9naW4tcGFnZS5qc1wiO1xyXG5pbXBvcnQgUmVnaXN0ZXJQYWdlIGZyb20gXCIuL3ZpZXdzL3JlZ2lzdGVyLXBhZ2UuanNcIjtcclxuaW1wb3J0IHsgYXBpTW9kZWwgfSBmcm9tIFwiLi9tb2RlbHMvYXBpTW9kZWwuanNcIjtcclxuXHJcbmNvbnN0IHJvdXRlcyA9IHtcclxuICAgIFwiL1wiOiBIb21lVmlldyxcclxuICAgIFwiL2Fib3V0XCI6IEFib3V0VmlldyxcclxuICAgIFwiL2NvbnRhY3RcIjogQ29udGFjdFZpZXcsXHJcbiAgICBcIi9tYXBcIjogTWFwVmlldyxcclxuICAgIFwiL2FkZC1zdG9yeVwiOiBBZGRTdG9yeVZpZXcsXHJcbiAgICBcIi9mYXZvcml0ZXNcIjogRmF2b3JpdGVzVmlldyxcclxuICAgIFwiL2xvZ2luXCI6IExvZ2luUGFnZSxcclxuICAgIFwiL3JlZ2lzdGVyXCI6IFJlZ2lzdGVyUGFnZSxcclxufTtcclxuXHJcbi8qID09PT09PT09PT09PT09PT09PT09PT09PT09PT09PVxyXG4gICDwn5SnIEZ1bmdzaSBVcGRhdGUgTmF2YmFyIERpbmFtaXNcclxuPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09ICovXHJcbmZ1bmN0aW9uIHVwZGF0ZU5hdmJhclVJKCkge1xyXG4gICAgY29uc3QgbmF2YmFyID0gZG9jdW1lbnQucXVlcnlTZWxlY3RvcihcIi5uYXZiYXJcIik7XHJcbiAgICBpZiAoIW5hdmJhcikgcmV0dXJuO1xyXG5cclxuICAgIC8vIGNhcmkgYXRhdSBidWF0IGRpdiBrYW5hbiB1bnR1ayB0b21ib2wgbG9naW4vbG9nb3V0XHJcbiAgICBsZXQgbmF2UmlnaHQgPSBuYXZiYXIucXVlcnlTZWxlY3RvcihcIi5uYXYtcmlnaHRcIik7XHJcbiAgICBpZiAoIW5hdlJpZ2h0KSB7XHJcbiAgICAgICAgbmF2UmlnaHQgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiZGl2XCIpO1xyXG4gICAgICAgIG5hdlJpZ2h0LmNsYXNzTGlzdC5hZGQoXCJuYXYtcmlnaHRcIik7XHJcbiAgICAgICAgbmF2YmFyLmFwcGVuZENoaWxkKG5hdlJpZ2h0KTtcclxuICAgIH1cclxuXHJcbiAgICAvLyBrb3NvbmdrYW4gZHVsdVxyXG4gICAgbmF2UmlnaHQuaW5uZXJIVE1MID0gXCJcIjtcclxuXHJcbiAgICBpZiAoYXBpTW9kZWwuaXNMb2dnZWRJbigpKSB7XHJcbiAgICAgICAgLy8gSmlrYSBzdWRhaCBsb2dpbiDihpIgdGFtcGlsa2FuIHRvbWJvbCBMb2dvdXRcclxuICAgICAgICBjb25zdCBsb2dvdXRCdG4gPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KFwiYVwiKTtcclxuICAgICAgICBsb2dvdXRCdG4uaHJlZiA9IFwiIy9sb2dpblwiO1xyXG4gICAgICAgIGxvZ291dEJ0bi50ZXh0Q29udGVudCA9IFwiTG9nb3V0XCI7XHJcbiAgICAgICAgbG9nb3V0QnRuLmNsYXNzTGlzdC5hZGQoXCJuYXYtbGlua1wiKTtcclxuXHJcbiAgICAgICAgbG9nb3V0QnRuLmFkZEV2ZW50TGlzdGVuZXIoXCJjbGlja1wiLCAoZSkgPT4ge1xyXG4gICAgICAgICAgICBlLnByZXZlbnREZWZhdWx0KCk7XHJcbiAgICAgICAgICAgIGFwaU1vZGVsLmxvZ291dCgpO1xyXG4gICAgICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiIy9sb2dpblwiO1xyXG4gICAgICAgICAgICB1cGRhdGVOYXZiYXJVSSgpOyAvLyByZWZyZXNoIHRhbXBpbGFuIG5hdmJhclxyXG4gICAgICAgIH0pO1xyXG5cclxuICAgICAgICBuYXZSaWdodC5hcHBlbmRDaGlsZChsb2dvdXRCdG4pO1xyXG4gICAgfSBlbHNlIHtcclxuICAgICAgICAvLyBKaWthIGJlbHVtIGxvZ2luIOKGkiB0YW1waWxrYW4gdG9tYm9sIExvZ2luICYgUmVnaXN0ZXJcclxuICAgICAgICBjb25zdCBsb2dpbkJ0biA9IGRvY3VtZW50LmNyZWF0ZUVsZW1lbnQoXCJhXCIpO1xyXG4gICAgICAgIGxvZ2luQnRuLmhyZWYgPSBcIiMvbG9naW5cIjtcclxuICAgICAgICBsb2dpbkJ0bi50ZXh0Q29udGVudCA9IFwiTG9naW5cIjtcclxuICAgICAgICBsb2dpbkJ0bi5jbGFzc0xpc3QuYWRkKFwibmF2LWxpbmtcIik7XHJcblxyXG4gICAgICAgIGNvbnN0IHJlZ2lzdGVyQnRuID0gZG9jdW1lbnQuY3JlYXRlRWxlbWVudChcImFcIik7XHJcbiAgICAgICAgcmVnaXN0ZXJCdG4uaHJlZiA9IFwiIy9yZWdpc3RlclwiO1xyXG4gICAgICAgIHJlZ2lzdGVyQnRuLnRleHRDb250ZW50ID0gXCJSZWdpc3RlclwiO1xyXG4gICAgICAgIHJlZ2lzdGVyQnRuLmNsYXNzTGlzdC5hZGQoXCJuYXYtbGlua1wiKTtcclxuXHJcbiAgICAgICAgbmF2UmlnaHQuYXBwZW5kQ2hpbGQobG9naW5CdG4pO1xyXG4gICAgICAgIG5hdlJpZ2h0LmFwcGVuZENoaWxkKHJlZ2lzdGVyQnRuKTtcclxuICAgIH1cclxufVxyXG5cclxuLyogPT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XHJcbiAgIPCfmqYgUm91dGVyIFNQQVxyXG49PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0gKi9cclxuZXhwb3J0IGZ1bmN0aW9uIGluaXRSb3V0ZXIoKSB7XHJcbiAgICB3aW5kb3cuYWRkRXZlbnRMaXN0ZW5lcihcImhhc2hjaGFuZ2VcIiwgcmVuZGVyUGFnZSk7XHJcbiAgICByZW5kZXJQYWdlKCk7IC8vIEluaXRpYWwgcmVuZGVyXHJcbn1cclxuXHJcbmFzeW5jIGZ1bmN0aW9uIHJlbmRlclBhZ2UoKSB7XHJcbiAgICBjb25zdCBhcHAgPSBkb2N1bWVudC5nZXRFbGVtZW50QnlJZChcImFwcFwiKTtcclxuICAgIGNvbnN0IHBhdGggPSBsb2NhdGlvbi5oYXNoLnNsaWNlKDEpLnRvTG93ZXJDYXNlKCkgfHwgXCIvXCI7XHJcblxyXG4gICAgY29uc3QgcHVibGljUm91dGVzID0gW1wiL2xvZ2luXCIsIFwiL3JlZ2lzdGVyXCJdO1xyXG4gICAgY29uc3QgaXNQdWJsaWMgPSBwdWJsaWNSb3V0ZXMuaW5jbHVkZXMocGF0aCk7XHJcblxyXG4gICAgLy8gamlrYSBiZWx1bSBsb2dpbiAmIGJ1a2FuIGRpIGhhbGFtYW4gcHVibGlrXHJcbiAgICBpZiAoIWlzUHVibGljICYmICFhcGlNb2RlbC5pc0xvZ2dlZEluKCkpIHtcclxuICAgICAgICBjb25zb2xlLndhcm4oXCLwn5SSIFBlbmdndW5hIGJlbHVtIGxvZ2luLCBtZW5nYXJhaGthbiBrZSAvbG9naW4uLi5cIik7XHJcbiAgICAgICAgd2luZG93LmxvY2F0aW9uLmhhc2ggPSBcIiMvbG9naW5cIjtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgLy8gamlrYSBzdWRhaCBsb2dpbiAmIG1lbmNvYmEgYWtzZXMgbG9naW4vcmVnaXN0ZXJcclxuICAgIGlmIChpc1B1YmxpYyAmJiBhcGlNb2RlbC5pc0xvZ2dlZEluKCkpIHtcclxuICAgICAgICB3aW5kb3cubG9jYXRpb24uaGFzaCA9IFwiIy9cIjtcclxuICAgICAgICByZXR1cm47XHJcbiAgICB9XHJcblxyXG4gICAgY29uc3QgUGFnZSA9IHJvdXRlc1twYXRoXSB8fCBIb21lVmlldztcclxuXHJcbiAgICAvLyBVc2UgVmlldyBUcmFuc2l0aW9uIEFQSSBpZiBzdXBwb3J0ZWRcclxuICAgIGlmIChkb2N1bWVudC5zdGFydFZpZXdUcmFuc2l0aW9uKSB7XHJcbiAgICAgICAgY29uc3QgdHJhbnNpdGlvbiA9IGRvY3VtZW50LnN0YXJ0Vmlld1RyYW5zaXRpb24oYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgICAgICBhcHAuaW5uZXJIVE1MID0gXCJcIjtcclxuXHJcbiAgICAgICAgICAgIGNvbnN0IHBhZ2VJbnN0YW5jZSA9IG5ldyBQYWdlKCk7XHJcbiAgICAgICAgICAgIGNvbnN0IHByZXNlbnRlciA9IG5ldyBQYWdlUHJlc2VudGVyKHBhZ2VJbnN0YW5jZSk7XHJcbiAgICAgICAgICAgIGNvbnN0IHZpZXcgPSBhd2FpdCBwcmVzZW50ZXIuZ2V0VmlldygpO1xyXG5cclxuICAgICAgICAgICAgaWYgKHZpZXcpIHtcclxuICAgICAgICAgICAgICAgIHZpZXcuY2xhc3NMaXN0LmFkZChcInZpZXctdHJhbnNpdGlvblwiKTtcclxuICAgICAgICAgICAgICAgIGFwcC5hcHBlbmRDaGlsZCh2aWV3KTtcclxuXHJcbiAgICAgICAgICAgICAgICAvLyBQYXN0aWthbiBhZnRlclJlbmRlcigpIHRlcnBhbmdnaWwgamlrYSBhZGFcclxuICAgICAgICAgICAgICAgIGlmIChwYWdlSW5zdGFuY2UuYWZ0ZXJSZW5kZXIpIHtcclxuICAgICAgICAgICAgICAgICAgICBhd2FpdCBwYWdlSW5zdGFuY2UuYWZ0ZXJSZW5kZXIoKTtcclxuICAgICAgICAgICAgICAgIH1cclxuICAgICAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCJWaWV3IHRpZGFrIGRpdGVtdWthbiB1bnR1ayByb3V0ZTpcIiwgcGF0aCk7XHJcbiAgICAgICAgICAgIH1cclxuICAgICAgICB9KTtcclxuXHJcbiAgICAgICAgLy8gVXBkYXRlIG5hdmJhciBhZnRlciB0cmFuc2l0aW9uXHJcbiAgICAgICAgdHJhbnNpdGlvbi5maW5pc2hlZC50aGVuKCgpID0+IHtcclxuICAgICAgICAgICAgdXBkYXRlTmF2YmFyVUkoKTtcclxuICAgICAgICB9KTtcclxuICAgIH0gZWxzZSB7XHJcbiAgICAgICAgLy8gRmFsbGJhY2sgZm9yIGJyb3dzZXJzIHdpdGhvdXQgVmlldyBUcmFuc2l0aW9uIEFQSVxyXG4gICAgICAgIGFwcC5pbm5lckhUTUwgPSBcIlwiO1xyXG5cclxuICAgICAgICBjb25zdCBwYWdlSW5zdGFuY2UgPSBuZXcgUGFnZSgpO1xyXG4gICAgICAgIGNvbnN0IHByZXNlbnRlciA9IG5ldyBQYWdlUHJlc2VudGVyKHBhZ2VJbnN0YW5jZSk7XHJcbiAgICAgICAgY29uc3QgdmlldyA9IGF3YWl0IHByZXNlbnRlci5nZXRWaWV3KCk7XHJcblxyXG4gICAgICAgIGlmICh2aWV3KSB7XHJcbiAgICAgICAgICAgIHZpZXcuY2xhc3NMaXN0LmFkZChcInZpZXctdHJhbnNpdGlvblwiKTtcclxuICAgICAgICAgICAgYXBwLmFwcGVuZENoaWxkKHZpZXcpO1xyXG5cclxuICAgICAgICAgICAgLy8gUGFzdGlrYW4gYWZ0ZXJSZW5kZXIoKSB0ZXJwYW5nZ2lsIGppa2EgYWRhXHJcbiAgICAgICAgICAgIGlmIChwYWdlSW5zdGFuY2UuYWZ0ZXJSZW5kZXIpIHtcclxuICAgICAgICAgICAgICAgIGF3YWl0IHBhZ2VJbnN0YW5jZS5hZnRlclJlbmRlcigpO1xyXG4gICAgICAgICAgICB9XHJcbiAgICAgICAgfSBlbHNlIHtcclxuICAgICAgICAgICAgY29uc29sZS5lcnJvcihcIlZpZXcgdGlkYWsgZGl0ZW11a2FuIHVudHVrIHJvdXRlOlwiLCBwYXRoKTtcclxuICAgICAgICB9XHJcblxyXG4gICAgICAgIC8vIFVwZGF0ZSB0b21ib2wgbmF2YmFyIHNlc3VhaSBzdGF0dXMgbG9naW5cclxuICAgICAgICB1cGRhdGVOYXZiYXJVSSgpO1xyXG4gICAgfVxyXG59XHJcblxyXG4iLCJpbXBvcnQgeyBpbml0Um91dGVyIH0gZnJvbSBcIi4vcm91dGVyLmpzXCI7XHJcbmltcG9ydCB7IGFwaU1vZGVsIH0gZnJvbSBcIi4vbW9kZWxzL2FwaU1vZGVsLmpzXCI7XHJcbmltcG9ydCB7IGZhdm9yaXRlREIgfSBmcm9tIFwiLi9kYi9mYXZvcml0ZS1kYi5qc1wiO1xyXG5cclxuaW1wb3J0ICcuLi9zdHlsZXMuY3NzJztcclxuXHJcbmRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIoXCJET01Db250ZW50TG9hZGVkXCIsICgpID0+IHtcclxuICAgIGluaXRSb3V0ZXIoKTtcclxuXHJcbiAgICAvLyBTeW5jIG9mZmxpbmUgc3RvcmllcyB3aGVuIGNvbWluZyBiYWNrIG9ubGluZVxyXG4gICAgd2luZG93LmFkZEV2ZW50TGlzdGVuZXIoXCJvbmxpbmVcIiwgYXN5bmMgKCkgPT4ge1xyXG4gICAgICAgIGNvbnNvbGUubG9nKFwi8J+MkCBLb25la3NpIGtlbWJhbGkgb25saW5lLCBzaW5rcm9uaXNhc2kgZGF0YSBvZmZsaW5lLi4uXCIpO1xyXG4gICAgICAgIHRyeSB7XHJcbiAgICAgICAgICAgIGF3YWl0IGZhdm9yaXRlREIuc3luY09mZmxpbmVTdG9yaWVzKGFwaU1vZGVsKTtcclxuICAgICAgICAgICAgY29uc29sZS5sb2coXCLinIUgU2lua3JvbmlzYXNpIHNlbGVzYWlcIik7XHJcbiAgICAgICAgfSBjYXRjaCAoZXJyKSB7XHJcbiAgICAgICAgICAgIGNvbnNvbGUuZXJyb3IoXCLinYwgR2FnYWwgc2lua3JvbmlzYXNpOlwiLCBlcnIpO1xyXG4gICAgICAgIH1cclxuICAgIH0pO1xyXG59KTtcclxuIl0sIm5hbWVzIjpbImUiLCJ0IiwiciIsIlN5bWJvbCIsIm4iLCJpdGVyYXRvciIsIm8iLCJ0b1N0cmluZ1RhZyIsImkiLCJjIiwicHJvdG90eXBlIiwiR2VuZXJhdG9yIiwidSIsIk9iamVjdCIsImNyZWF0ZSIsIl9yZWdlbmVyYXRvckRlZmluZTIiLCJmIiwicCIsInkiLCJHIiwidiIsImEiLCJkIiwiYmluZCIsImxlbmd0aCIsImwiLCJUeXBlRXJyb3IiLCJjYWxsIiwiZG9uZSIsInZhbHVlIiwiR2VuZXJhdG9yRnVuY3Rpb24iLCJHZW5lcmF0b3JGdW5jdGlvblByb3RvdHlwZSIsImdldFByb3RvdHlwZU9mIiwic2V0UHJvdG90eXBlT2YiLCJfX3Byb3RvX18iLCJkaXNwbGF5TmFtZSIsIl9yZWdlbmVyYXRvciIsInciLCJtIiwiZGVmaW5lUHJvcGVydHkiLCJfcmVnZW5lcmF0b3JEZWZpbmUiLCJfaW52b2tlIiwiZW51bWVyYWJsZSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXN5bmNHZW5lcmF0b3JTdGVwIiwiUHJvbWlzZSIsInJlc29sdmUiLCJ0aGVuIiwiX2FzeW5jVG9HZW5lcmF0b3IiLCJhcmd1bWVudHMiLCJhcHBseSIsIl9uZXh0IiwiX3Rocm93Iiwib3BlbkRCIiwiREJfTkFNRSIsIlNUT1JFX0ZBVk9SSVRFUyIsIlNUT1JFX09GRkxJTkVfU1RPUklFUyIsImZhdm9yaXRlREIiLCJpbml0IiwiX2NhbGxlZSIsIl9jb250ZXh0IiwidXBncmFkZSIsImRiIiwib2xkVmVyc2lvbiIsIm9iamVjdFN0b3JlTmFtZXMiLCJjb250YWlucyIsImNyZWF0ZU9iamVjdFN0b3JlIiwia2V5UGF0aCIsImF1dG9JbmNyZW1lbnQiLCJhZGRGYXZvcml0ZSIsInN0b3J5IiwiX3RoaXMiLCJfY2FsbGVlMiIsIl9jb250ZXh0MiIsInB1dCIsImNvbnNvbGUiLCJsb2ciLCJuYW1lIiwiZ2V0QWxsRmF2b3JpdGVzIiwiX3RoaXMyIiwiX2NhbGxlZTMiLCJfY29udGV4dDMiLCJnZXRBbGwiLCJkZWxldGVGYXZvcml0ZSIsImlkIiwiX3RoaXMzIiwiX2NhbGxlZTQiLCJfY29udGV4dDQiLCJzZWFyY2hGYXZvcml0ZXMiLCJxdWVyeSIsIl90aGlzNCIsIl9jYWxsZWU1IiwiZmF2b3JpdGVzIiwiX2NvbnRleHQ1IiwiZmlsdGVyIiwidG9Mb3dlckNhc2UiLCJpbmNsdWRlcyIsImRlc2NyaXB0aW9uIiwiZmlsdGVyRmF2b3JpdGVzQnlEYXRlIiwiX2FyZ3VtZW50cyIsIl90aGlzNSIsIl9jYWxsZWU2Iiwib3JkZXIiLCJfY29udGV4dDYiLCJ1bmRlZmluZWQiLCJzb3J0IiwiYiIsImRhdGVBIiwiRGF0ZSIsImNyZWF0ZWRBdCIsImRhdGVCIiwic29ydEZhdm9yaXRlc0J5TmFtZSIsIl9hcmd1bWVudHMyIiwiX3RoaXM2IiwiX2NhbGxlZTciLCJfY29udGV4dDciLCJuYW1lQSIsIm5hbWVCIiwiYWRkT2ZmbGluZVN0b3J5IiwiZm9ybURhdGEiLCJfdGhpczciLCJfY2FsbGVlOCIsInN0b3J5RGF0YSIsIl90IiwiX3QyIiwiX2NvbnRleHQ4IiwiZm9ybURhdGFUb09iamVjdCIsIm5vdyIsInRpbWVzdGFtcCIsInN5bmNlZCIsImFkZCIsImdldE9mZmxpbmVTdG9yaWVzIiwiX3RoaXM4IiwiX2NhbGxlZTkiLCJfY29udGV4dDkiLCJkZWxldGVPZmZsaW5lU3RvcnkiLCJfdGhpczkiLCJfY2FsbGVlMCIsIl9jb250ZXh0MCIsIm1hcmtTeW5jZWQiLCJfdGhpczAiLCJfY2FsbGVlMSIsIl9jb250ZXh0MSIsImdldCIsInN5bmNPZmZsaW5lU3RvcmllcyIsImFwaU1vZGVsIiwiX3RoaXMxIiwiX2NhbGxlZTEwIiwib2ZmbGluZVN0b3JpZXMiLCJ1bnN5bmNlZCIsIl9pdGVyYXRvciIsIl9zdGVwIiwicmVzdWx0IiwiX3QzIiwiX3Q0IiwiX2NvbnRleHQxMCIsIl9jcmVhdGVGb3JPZkl0ZXJhdG9ySGVscGVyIiwicyIsIm9iamVjdFRvRm9ybURhdGEiLCJhZGRTdG9yeSIsImVycm9yIiwiX3RoaXMxMCIsIl9jYWxsZWUxMSIsIm9iaiIsIl9pdGVyYXRvcjIiLCJfc3RlcDIiLCJfc3RlcDIkdmFsdWUiLCJrZXkiLCJfdDUiLCJfdDYiLCJfdDciLCJfdDgiLCJfdDkiLCJfY29udGV4dDExIiwiZW50cmllcyIsIl9zbGljZWRUb0FycmF5IiwiRmlsZSIsInR5cGUiLCJzaXplIiwiZmlsZVRvQmFzZTY0IiwiZGF0YSIsIkZvcm1EYXRhIiwiX2kiLCJfT2JqZWN0JGVudHJpZXMiLCJfT2JqZWN0JGVudHJpZXMkX2kiLCJfdHlwZW9mIiwiZmlsZSIsImJhc2U2NFRvRmlsZSIsImFwcGVuZCIsIl9jYWxsZWUxMiIsIl9jb250ZXh0MTIiLCJyZWplY3QiLCJyZWFkZXIiLCJGaWxlUmVhZGVyIiwib25sb2FkIiwib25lcnJvciIsInJlYWRBc0RhdGFVUkwiLCJiYXNlNjQiLCJmaWxlbmFtZSIsIm1pbWVUeXBlIiwiYXJyIiwic3BsaXQiLCJic3RyIiwiYXRvYiIsInU4YXJyIiwiVWludDhBcnJheSIsImNoYXJDb2RlQXQiLCJfY2xhc3NDYWxsQ2hlY2siLCJfZGVmaW5lUHJvcGVydGllcyIsIl90b1Byb3BlcnR5S2V5IiwiX2NyZWF0ZUNsYXNzIiwiX3RvUHJpbWl0aXZlIiwidG9QcmltaXRpdmUiLCJTdHJpbmciLCJOdW1iZXIiLCJQYWdlUHJlc2VudGVyIiwidmlldyIsIl9nZXRWaWV3Iiwidmlld0VsZW1lbnQiLCJyZW5kZXIiLCJzZXRUaW1lb3V0IiwiYWZ0ZXJSZW5kZXIiLCJnZXRWaWV3IiwiZGF0YU1vZGVsIiwiYXBwTmFtZSIsImFib3V0IiwiY29udGFjdCIsIkJBU0VfVVJMIiwicmVnaXN0ZXIiLCJlbWFpbCIsInBhc3N3b3JkIiwicmVzcG9uc2UiLCJmZXRjaCIsImNvbmNhdCIsIm1ldGhvZCIsImhlYWRlcnMiLCJib2R5IiwiSlNPTiIsInN0cmluZ2lmeSIsImpzb24iLCJFcnJvciIsIm1lc3NhZ2UiLCJzdWNjZXNzIiwibG9naW4iLCJ0b2tlbiIsImxvZ2luUmVzdWx0IiwibG9jYWxTdG9yYWdlIiwic2V0SXRlbSIsImxvZ291dCIsInJlbW92ZUl0ZW0iLCJnZXRUb2tlbiIsImdldEl0ZW0iLCJpc0xvZ2dlZEluIiwiZ2V0U3RvcmllcyIsImNhY2hlZFN0b3JpZXMiLCJfY2FjaGVkU3RvcmllcyIsIndhcm4iLCJuYXZpZ2F0b3IiLCJvbkxpbmUiLCJwYXJzZSIsIkF1dGhvcml6YXRpb24iLCJsaXN0U3RvcnkiLCJzdWJzY3JpYmVXZWJQdXNoIiwic3Vic2NyaXB0aW9uIiwiZW5kcG9pbnQiLCJrZXlzIiwicDI1NmRoIiwiYXV0aCIsInVuc3Vic2NyaWJlV2ViUHVzaCIsInNlcnZpY2VXb3JrZXIiLCJlcnIiLCJkZWZlcnJlZFByb21wdCIsIndpbmRvdyIsImFkZEV2ZW50TGlzdGVuZXIiLCJwcmV2ZW50RGVmYXVsdCIsImluc3RhbGxCdG4iLCJkb2N1bWVudCIsImNyZWF0ZUVsZW1lbnQiLCJ0ZXh0Q29udGVudCIsImNsYXNzTGlzdCIsImFwcGVuZENoaWxkIiwiX3lpZWxkJGRlZmVycmVkUHJvbXB0Iiwib3V0Y29tZSIsInN0eWxlIiwiZGlzcGxheSIsInByb21wdCIsInVzZXJDaG9pY2UiLCJWQVBJRF9QVUJMSUNfS0VZIiwicHVzaE1hbmFnZXIiLCJzdWJzY3JpYmUiLCJyZWdpc3RyYXRpb24iLCJyZWFkeSIsInVzZXJWaXNpYmxlT25seSIsImFwcGxpY2F0aW9uU2VydmVyS2V5IiwidXJsQmFzZTY0VG9VaW50OEFycmF5IiwidG9KU09OIiwidW5zdWJzY3JpYmUiLCJnZXRTdWJzY3JpcHRpb24iLCJpc1N1YnNjcmliZWQiLCJiYXNlNjRTdHJpbmciLCJwYWRkaW5nIiwicmVwZWF0IiwicmVwbGFjZSIsInJhd0RhdGEiLCJvdXRwdXRBcnJheSIsIkhvbWVWaWV3IiwiZGl2IiwiY2xhc3NOYW1lIiwic2V0QXR0cmlidXRlIiwiaW5uZXJIVE1MIiwiX2FmdGVyUmVuZGVyIiwidG9nZ2xlQnRuIiwic3RhdHVzRWwiLCJnZXRFbGVtZW50QnlJZCIsImRpc2FibGVkIiwibG9jYXRpb24iLCJwcm90b2NvbCIsImhvc3RuYW1lIiwidXBkYXRlVUkiLCJuZXdTdGF0dXMiLCJhbGVydCIsImRlZmF1bHQiLCJBYm91dFZpZXciLCJDb250YWN0VmlldyIsIk1hcFZpZXciLCJtYXAiLCJtYXJrZXJzIiwic3RvcmllcyIsIl9yZW5kZXIiLCJjb250YWluZXIiLCJpbml0TWFwIiwiX2luaXRNYXAiLCJtYXBFbCIsImxpc3RFbCIsInRpbGUxIiwidGlsZTIiLCJxdWVyeVNlbGVjdG9yIiwicmVtb3ZlIiwiTCIsInNldFZpZXciLCJ0aWxlTGF5ZXIiLCJhdHRyaWJ1dGlvbiIsImFkZFRvIiwiY29udHJvbCIsImxheWVycyIsInJlcXVlc3RBbmltYXRpb25GcmFtZSIsImludmFsaWRhdGVTaXplIiwicmVuZGVyU3RvcnlMaXN0IiwiZm9yRWFjaCIsImxhdCIsImxvbiIsIm1hcmtlciIsImJpbmRQb3B1cCIsInB1c2giLCJfcmVmIiwiaXRlbSIsImZhdm9yaXRlQnRuIiwiaW5kZXgiLCJ0YXJnZXQiLCJjbG9zZXN0Iiwic3RvcFByb3BhZ2F0aW9uIiwidG9nZ2xlRmF2b3JpdGUiLCJkYXRhc2V0IiwiZmx5VG8iLCJvcGVuUG9wdXAiLCJxdWVyeVNlbGVjdG9yQWxsIiwiZWwiLCJfeDIiLCJjbGljayIsIl94IiwiX3JlbmRlclN0b3J5TGlzdCIsImZhdm9yaXRlSWRzIiwiU2V0IiwiZmF2IiwicGhvdG9VcmwiLCJ0b0xvY2FsZURhdGVTdHJpbmciLCJoYXMiLCJqb2luIiwiX3gzIiwiX3RvZ2dsZUZhdm9yaXRlIiwic3RvcnlJZCIsImlzRmF2b3JpdGVkIiwiZmF2b3JpdGVEYXRhIiwiZmluZCIsInNvbWUiLCJ0b0lTT1N0cmluZyIsIl94NCIsIkFkZFN0b3J5VmlldyIsIm1hcENvbnRhaW5lciIsImxvY2F0aW9uSW5mbyIsImZvcm0iLCJtYXhab29tIiwib24iLCJfZSRsYXRsbmciLCJsYXRsbmciLCJsbmciLCJyZW1vdmVMYXllciIsInRvRml4ZWQiLCJfeWllbGQkaW1wb3J0IiwiaGFzaCIsIkZhdm9yaXRlc1ZpZXciLCJmaWx0ZXJlZEZhdm9yaXRlcyIsInNlYXJjaFF1ZXJ5Iiwic29ydE9yZGVyIiwic29ydEJ5Iiwic2VhcmNoSW5wdXQiLCJjbGVhckJ0biIsInNvcnRCeVNlbGVjdCIsInNvcnRPcmRlclNlbGVjdCIsImxvYWRGYXZvcml0ZXMiLCJhcHBseUZpbHRlcnMiLCJfbG9hZEZhdm9yaXRlcyIsInNob3dFcnJvciIsImZpbHRlcmVkIiwiX3RvQ29uc3VtYWJsZUFycmF5IiwicmVuZGVyRmF2b3JpdGVzTGlzdCIsImVzY2FwZUh0bWwiLCJidG4iLCJyZW1vdmVGYXZvcml0ZSIsIl9yZW1vdmVGYXZvcml0ZSIsInRleHQiLCJMb2dpblBhZ2UiLCJidXR0b24iLCJ0cmltIiwiUmVnaXN0ZXJQYWdlIiwicm91dGVzIiwidXBkYXRlTmF2YmFyVUkiLCJuYXZiYXIiLCJuYXZSaWdodCIsImxvZ291dEJ0biIsImhyZWYiLCJsb2dpbkJ0biIsInJlZ2lzdGVyQnRuIiwiaW5pdFJvdXRlciIsInJlbmRlclBhZ2UiLCJfcmVuZGVyUGFnZSIsImFwcCIsInBhdGgiLCJwdWJsaWNSb3V0ZXMiLCJpc1B1YmxpYyIsIlBhZ2UiLCJ0cmFuc2l0aW9uIiwicGFnZUluc3RhbmNlIiwicHJlc2VudGVyIiwic2xpY2UiLCJzdGFydFZpZXdUcmFuc2l0aW9uIiwiZmluaXNoZWQiXSwic291cmNlUm9vdCI6IiJ9