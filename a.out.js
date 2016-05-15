// The Module object: Our interface to the outside world. We import
// and export values on it, and do the work to get that through
// closure compiler if necessary. There are various ways Module can be used:
// 1. Not defined. We create it here
// 2. A function parameter, function(Module) { ..generated code.. }
// 3. pre-run appended it, var Module = {}; ..generated code..
// 4. External script tag defines var Module.
// We need to do an eval in order to handle the closure compiler
// case, where this code here is minified but Module was defined
// elsewhere (e.g. case 4 above). We also need to check if Module
// already exists (e.g. case 3 above).
// Note that if you want to run closure, and also to use Module
// after the generated code, you will need to define   var Module = {};
// before the code. Then that object will be used in the code, and you
// can continue to use Module afterwards as well.
var Module;
if (!Module) Module = (typeof Module !== 'undefined' ? Module : null) || {};

// Sometimes an existing Module object exists with properties
// meant to overwrite the default module functionality. Here
// we collect those properties and reapply _after_ we configure
// the current environment's defaults to avoid having to be so
// defensive during initialization.
var moduleOverrides = {};
for (var key in Module) {
  if (Module.hasOwnProperty(key)) {
    moduleOverrides[key] = Module[key];
  }
}

// The environment setup code below is customized to use Module.
// *** Environment setup code ***
var ENVIRONMENT_IS_WEB = false;
var ENVIRONMENT_IS_WORKER = false;
var ENVIRONMENT_IS_NODE = false;
var ENVIRONMENT_IS_SHELL = false;

// Three configurations we can be running in:
// 1) We could be the application main() thread running in the main JS UI thread. (ENVIRONMENT_IS_WORKER == false and ENVIRONMENT_IS_PTHREAD == false)
// 2) We could be the application main() thread proxied to worker. (with Emscripten -s PROXY_TO_WORKER=1) (ENVIRONMENT_IS_WORKER == true, ENVIRONMENT_IS_PTHREAD == false)
// 3) We could be an application pthread running in a worker. (ENVIRONMENT_IS_WORKER == true and ENVIRONMENT_IS_PTHREAD == true)

if (Module['ENVIRONMENT']) {
  if (Module['ENVIRONMENT'] === 'WEB') {
    ENVIRONMENT_IS_WEB = true;
  } else if (Module['ENVIRONMENT'] === 'WORKER') {
    ENVIRONMENT_IS_WORKER = true;
  } else if (Module['ENVIRONMENT'] === 'NODE') {
    ENVIRONMENT_IS_NODE = true;
  } else if (Module['ENVIRONMENT'] === 'SHELL') {
    ENVIRONMENT_IS_SHELL = true;
  } else {
    throw new Error('The provided Module[\'ENVIRONMENT\'] value is not valid. It must be one of: WEB|WORKER|NODE|SHELL.');
  }
} else {
  ENVIRONMENT_IS_WEB = typeof window === 'object';
  ENVIRONMENT_IS_WORKER = typeof importScripts === 'function';
  ENVIRONMENT_IS_NODE = typeof process === 'object' && typeof require === 'function' && !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_WORKER;
  ENVIRONMENT_IS_SHELL = !ENVIRONMENT_IS_WEB && !ENVIRONMENT_IS_NODE && !ENVIRONMENT_IS_WORKER;
}


if (ENVIRONMENT_IS_NODE) {
  // Expose functionality in the same simple way that the shells work
  // Note that we pollute the global namespace here, otherwise we break in node
  if (!Module['print']) Module['print'] = console.log;
  if (!Module['printErr']) Module['printErr'] = console.warn;

  var nodeFS;
  var nodePath;

  Module['read'] = function read(filename, binary) {
    if (!nodeFS) nodeFS = require('fs');
    if (!nodePath) nodePath = require('path');

    filename = nodePath['normalize'](filename);
    var ret = nodeFS['readFileSync'](filename);
    // The path is absolute if the normalized version is the same as the resolved.
    if (!ret && filename != nodePath['resolve'](filename)) {
      filename = path.join(__dirname, '..', 'src', filename);
      ret = nodeFS['readFileSync'](filename);
    }
    if (ret && !binary) ret = ret.toString();
    return ret;
  };

  Module['readBinary'] = function readBinary(filename) {
    var ret = Module['read'](filename, true);
    if (!ret.buffer) {
      ret = new Uint8Array(ret);
    }
    assert(ret.buffer);
    return ret;
  };

  Module['load'] = function load(f) {
    globalEval(read(f));
  };

  if (!Module['thisProgram']) {
    if (process['argv'].length > 1) {
      Module['thisProgram'] = process['argv'][1].replace(/\\/g, '/');
    } else {
      Module['thisProgram'] = 'unknown-program';
    }
  }

  Module['arguments'] = process['argv'].slice(2);

  if (typeof module !== 'undefined') {
    module['exports'] = Module;
  }

  process['on']('uncaughtException', function(ex) {
    // suppress ExitStatus exceptions from showing an error
    if (!(ex instanceof ExitStatus)) {
      throw ex;
    }
  });

  Module['inspect'] = function () { return '[Emscripten Module object]'; };
}
else if (ENVIRONMENT_IS_SHELL) {
  if (!Module['print']) Module['print'] = print;
  if (typeof printErr != 'undefined') Module['printErr'] = printErr; // not present in v8 or older sm

  if (typeof read != 'undefined') {
    Module['read'] = read;
  } else {
    Module['read'] = function read() { throw 'no read() available (jsc?)' };
  }

  Module['readBinary'] = function readBinary(f) {
    if (typeof readbuffer === 'function') {
      return new Uint8Array(readbuffer(f));
    }
    var data = read(f, 'binary');
    assert(typeof data === 'object');
    return data;
  };

  if (typeof scriptArgs != 'undefined') {
    Module['arguments'] = scriptArgs;
  } else if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

}
else if (ENVIRONMENT_IS_WEB || ENVIRONMENT_IS_WORKER) {
  Module['read'] = function read(url) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, false);
    xhr.send(null);
    return xhr.responseText;
  };

  Module['readAsync'] = function readAsync(url, onload, onerror) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'arraybuffer';
    xhr.onload = function xhr_onload() {
      if (xhr.status == 200 || (xhr.status == 0 && xhr.response)) { // file URLs can return 0
        onload(xhr.response);
      } else {
        onerror();
      }
    };
    xhr.onerror = onerror;
    xhr.send(null);
  };

  if (typeof arguments != 'undefined') {
    Module['arguments'] = arguments;
  }

  if (typeof console !== 'undefined') {
    if (!Module['print']) Module['print'] = function print(x) {
      console.log(x);
    };
    if (!Module['printErr']) Module['printErr'] = function printErr(x) {
      console.warn(x);
    };
  } else {
    // Probably a worker, and without console.log. We can do very little here...
    var TRY_USE_DUMP = false;
    if (!Module['print']) Module['print'] = (TRY_USE_DUMP && (typeof(dump) !== "undefined") ? (function(x) {
      dump(x);
    }) : (function(x) {
      // self.postMessage(x); // enable this if you want stdout to be sent as messages
    }));
  }

  if (ENVIRONMENT_IS_WORKER) {
    Module['load'] = importScripts;
  }

  if (typeof Module['setWindowTitle'] === 'undefined') {
    Module['setWindowTitle'] = function(title) { document.title = title };
  }
}
else {
  // Unreachable because SHELL is dependant on the others
  throw 'Unknown runtime environment. Where are we?';
}

function globalEval(x) {
  eval.call(null, x);
}
if (!Module['load'] && Module['read']) {
  Module['load'] = function load(f) {
    globalEval(Module['read'](f));
  };
}
if (!Module['print']) {
  Module['print'] = function(){};
}
if (!Module['printErr']) {
  Module['printErr'] = Module['print'];
}
if (!Module['arguments']) {
  Module['arguments'] = [];
}
if (!Module['thisProgram']) {
  Module['thisProgram'] = './this.program';
}

// *** Environment setup code ***

// Closure helpers
Module.print = Module['print'];
Module.printErr = Module['printErr'];

// Callbacks
Module['preRun'] = [];
Module['postRun'] = [];

// Merge back in the overrides
for (var key in moduleOverrides) {
  if (moduleOverrides.hasOwnProperty(key)) {
    Module[key] = moduleOverrides[key];
  }
}
// Free the object hierarchy contained in the overrides, this lets the GC
// reclaim data used e.g. in memoryInitializerRequest, which is a large typed array.
moduleOverrides = undefined;



// {{PREAMBLE_ADDITIONS}}

// === Preamble library stuff ===

// Documentation for the public APIs defined in this file must be updated in: 
//    site/source/docs/api_reference/preamble.js.rst
// A prebuilt local version of the documentation is available at: 
//    site/build/text/docs/api_reference/preamble.js.txt
// You can also build docs locally as HTML or other formats in site/
// An online HTML version (which may be of a different version of Emscripten)
//    is up at http://kripken.github.io/emscripten-site/docs/api_reference/preamble.js.html

//========================================
// Runtime code shared with compiler
//========================================

var Runtime = {
  setTempRet0: function (value) {
    tempRet0 = value;
  },
  getTempRet0: function () {
    return tempRet0;
  },
  stackSave: function () {
    return STACKTOP;
  },
  stackRestore: function (stackTop) {
    STACKTOP = stackTop;
  },
  getNativeTypeSize: function (type) {
    switch (type) {
      case 'i1': case 'i8': return 1;
      case 'i16': return 2;
      case 'i32': return 4;
      case 'i64': return 8;
      case 'float': return 4;
      case 'double': return 8;
      default: {
        if (type[type.length-1] === '*') {
          return Runtime.QUANTUM_SIZE; // A pointer
        } else if (type[0] === 'i') {
          var bits = parseInt(type.substr(1));
          assert(bits % 8 === 0);
          return bits/8;
        } else {
          return 0;
        }
      }
    }
  },
  getNativeFieldSize: function (type) {
    return Math.max(Runtime.getNativeTypeSize(type), Runtime.QUANTUM_SIZE);
  },
  STACK_ALIGN: 16,
  prepVararg: function (ptr, type) {
    if (type === 'double' || type === 'i64') {
      // move so the load is aligned
      if (ptr & 7) {
        assert((ptr & 7) === 4);
        ptr += 4;
      }
    } else {
      assert((ptr & 3) === 0);
    }
    return ptr;
  },
  getAlignSize: function (type, size, vararg) {
    // we align i64s and doubles on 64-bit boundaries, unlike x86
    if (!vararg && (type == 'i64' || type == 'double')) return 8;
    if (!type) return Math.min(size, 8); // align structures internally to 64 bits
    return Math.min(size || (type ? Runtime.getNativeFieldSize(type) : 0), Runtime.QUANTUM_SIZE);
  },
  dynCall: function (sig, ptr, args) {
    if (args && args.length) {
      assert(args.length == sig.length-1);
      if (!args.splice) args = Array.prototype.slice.call(args);
      args.splice(0, 0, ptr);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].apply(null, args);
    } else {
      assert(sig.length == 1);
      assert(('dynCall_' + sig) in Module, 'bad function pointer type - no table for sig \'' + sig + '\'');
      return Module['dynCall_' + sig].call(null, ptr);
    }
  },
  functionPointers: [],
  addFunction: function (func) {
    for (var i = 0; i < Runtime.functionPointers.length; i++) {
      if (!Runtime.functionPointers[i]) {
        Runtime.functionPointers[i] = func;
        return 2*(1 + i);
      }
    }
    throw 'Finished up all reserved function pointers. Use a higher value for RESERVED_FUNCTION_POINTERS.';
  },
  removeFunction: function (index) {
    Runtime.functionPointers[(index-2)/2] = null;
  },
  warnOnce: function (text) {
    if (!Runtime.warnOnce.shown) Runtime.warnOnce.shown = {};
    if (!Runtime.warnOnce.shown[text]) {
      Runtime.warnOnce.shown[text] = 1;
      Module.printErr(text);
    }
  },
  funcWrappers: {},
  getFuncWrapper: function (func, sig) {
    assert(sig);
    if (!Runtime.funcWrappers[sig]) {
      Runtime.funcWrappers[sig] = {};
    }
    var sigCache = Runtime.funcWrappers[sig];
    if (!sigCache[func]) {
      sigCache[func] = function dynCall_wrapper() {
        return Runtime.dynCall(sig, func, arguments);
      };
    }
    return sigCache[func];
  },
  getCompilerSetting: function (name) {
    throw 'You must build with -s RETAIN_COMPILER_SETTINGS=1 for Runtime.getCompilerSetting or emscripten_get_compiler_setting to work';
  },
  stackAlloc: function (size) { var ret = STACKTOP;STACKTOP = (STACKTOP + size)|0;STACKTOP = (((STACKTOP)+15)&-16);(assert((((STACKTOP|0) < (STACK_MAX|0))|0))|0); return ret; },
  staticAlloc: function (size) { var ret = STATICTOP;STATICTOP = (STATICTOP + (assert(!staticSealed),size))|0;STATICTOP = (((STATICTOP)+15)&-16); return ret; },
  dynamicAlloc: function (size) { var ret = DYNAMICTOP;DYNAMICTOP = (DYNAMICTOP + (assert(DYNAMICTOP > 0),size))|0;DYNAMICTOP = (((DYNAMICTOP)+15)&-16); if (DYNAMICTOP >= TOTAL_MEMORY) { var success = enlargeMemory(); if (!success) { DYNAMICTOP = ret;  return 0; } }; return ret; },
  alignMemory: function (size,quantum) { var ret = size = Math.ceil((size)/(quantum ? quantum : 16))*(quantum ? quantum : 16); return ret; },
  makeBigInt: function (low,high,unsigned) { var ret = (unsigned ? ((+((low>>>0)))+((+((high>>>0)))*4294967296.0)) : ((+((low>>>0)))+((+((high|0)))*4294967296.0))); return ret; },
  GLOBAL_BASE: 8,
  QUANTUM_SIZE: 4,
  __dummy__: 0
}



Module["Runtime"] = Runtime;



//========================================
// Runtime essentials
//========================================

var ABORT = false; // whether we are quitting the application. no code should run after this. set in exit() and abort()
var EXITSTATUS = 0;

function assert(condition, text) {
  if (!condition) {
    abort('Assertion failed: ' + text);
  }
}

var globalScope = this;

// Returns the C function with a specified identifier (for C++, you need to do manual name mangling)
function getCFunc(ident) {
  var func = Module['_' + ident]; // closure exported function
  if (!func) {
    try { func = eval('_' + ident); } catch(e) {}
  }
  assert(func, 'Cannot call unknown function ' + ident + ' (perhaps LLVM optimizations or closure removed it?)');
  return func;
}

var cwrap, ccall;
(function(){
  var JSfuncs = {
    // Helpers for cwrap -- it can't refer to Runtime directly because it might
    // be renamed by closure, instead it calls JSfuncs['stackSave'].body to find
    // out what the minified function name is.
    'stackSave': function() {
      Runtime.stackSave()
    },
    'stackRestore': function() {
      Runtime.stackRestore()
    },
    // type conversion from js to c
    'arrayToC' : function(arr) {
      var ret = Runtime.stackAlloc(arr.length);
      writeArrayToMemory(arr, ret);
      return ret;
    },
    'stringToC' : function(str) {
      var ret = 0;
      if (str !== null && str !== undefined && str !== 0) { // null string
        // at most 4 bytes per UTF-8 code point, +1 for the trailing '\0'
        ret = Runtime.stackAlloc((str.length << 2) + 1);
        writeStringToMemory(str, ret);
      }
      return ret;
    }
  };
  // For fast lookup of conversion functions
  var toC = {'string' : JSfuncs['stringToC'], 'array' : JSfuncs['arrayToC']};

  // C calling interface. 
  ccall = function ccallFunc(ident, returnType, argTypes, args, opts) {
    var func = getCFunc(ident);
    var cArgs = [];
    var stack = 0;
    assert(returnType !== 'array', 'Return type should not be "array".');
    if (args) {
      for (var i = 0; i < args.length; i++) {
        var converter = toC[argTypes[i]];
        if (converter) {
          if (stack === 0) stack = Runtime.stackSave();
          cArgs[i] = converter(args[i]);
        } else {
          cArgs[i] = args[i];
        }
      }
    }
    var ret = func.apply(null, cArgs);
    if ((!opts || !opts.async) && typeof EmterpreterAsync === 'object') {
      assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling ccall');
    }
    if (opts && opts.async) assert(!returnType, 'async ccalls cannot return values');
    if (returnType === 'string') ret = Pointer_stringify(ret);
    if (stack !== 0) {
      if (opts && opts.async) {
        EmterpreterAsync.asyncFinalizers.push(function() {
          Runtime.stackRestore(stack);
        });
        return;
      }
      Runtime.stackRestore(stack);
    }
    return ret;
  }

  var sourceRegex = /^function\s*[a-zA-Z$_0-9]*\s*\(([^)]*)\)\s*{\s*([^*]*?)[\s;]*(?:return\s*(.*?)[;\s]*)?}$/;
  function parseJSFunc(jsfunc) {
    // Match the body and the return value of a javascript function source
    var parsed = jsfunc.toString().match(sourceRegex).slice(1);
    return {arguments : parsed[0], body : parsed[1], returnValue: parsed[2]}
  }

  // sources of useful functions. we create this lazily as it can trigger a source decompression on this entire file
  var JSsource = null;
  function ensureJSsource() {
    if (!JSsource) {
      JSsource = {};
      for (var fun in JSfuncs) {
        if (JSfuncs.hasOwnProperty(fun)) {
          // Elements of toCsource are arrays of three items:
          // the code, and the return value
          JSsource[fun] = parseJSFunc(JSfuncs[fun]);
        }
      }
    }
  }
  
  cwrap = function cwrap(ident, returnType, argTypes) {
    argTypes = argTypes || [];
    var cfunc = getCFunc(ident);
    // When the function takes numbers and returns a number, we can just return
    // the original function
    var numericArgs = argTypes.every(function(type){ return type === 'number'});
    var numericRet = (returnType !== 'string');
    if ( numericRet && numericArgs) {
      return cfunc;
    }
    // Creation of the arguments list (["$1","$2",...,"$nargs"])
    var argNames = argTypes.map(function(x,i){return '$'+i});
    var funcstr = "(function(" + argNames.join(',') + ") {";
    var nargs = argTypes.length;
    if (!numericArgs) {
      // Generate the code needed to convert the arguments from javascript
      // values to pointers
      ensureJSsource();
      funcstr += 'var stack = ' + JSsource['stackSave'].body + ';';
      for (var i = 0; i < nargs; i++) {
        var arg = argNames[i], type = argTypes[i];
        if (type === 'number') continue;
        var convertCode = JSsource[type + 'ToC']; // [code, return]
        funcstr += 'var ' + convertCode.arguments + ' = ' + arg + ';';
        funcstr += convertCode.body + ';';
        funcstr += arg + '=(' + convertCode.returnValue + ');';
      }
    }

    // When the code is compressed, the name of cfunc is not literally 'cfunc' anymore
    var cfuncname = parseJSFunc(function(){return cfunc}).returnValue;
    // Call the function
    funcstr += 'var ret = ' + cfuncname + '(' + argNames.join(',') + ');';
    if (!numericRet) { // Return type can only by 'string' or 'number'
      // Convert the result to a string
      var strgfy = parseJSFunc(function(){return Pointer_stringify}).returnValue;
      funcstr += 'ret = ' + strgfy + '(ret);';
    }
    funcstr += "if (typeof EmterpreterAsync === 'object') { assert(!EmterpreterAsync.state, 'cannot start async op with normal JS calling cwrap') }";
    if (!numericArgs) {
      // If we had a stack, restore it
      ensureJSsource();
      funcstr += JSsource['stackRestore'].body.replace('()', '(stack)') + ';';
    }
    funcstr += 'return ret})';
    return eval(funcstr);
  };
})();
Module["ccall"] = ccall;
Module["cwrap"] = cwrap;

function setValue(ptr, value, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': HEAP8[((ptr)>>0)]=value; break;
      case 'i8': HEAP8[((ptr)>>0)]=value; break;
      case 'i16': HEAP16[((ptr)>>1)]=value; break;
      case 'i32': HEAP32[((ptr)>>2)]=value; break;
      case 'i64': (tempI64 = [value>>>0,(tempDouble=value,(+(Math_abs(tempDouble))) >= 1.0 ? (tempDouble > 0.0 ? ((Math_min((+(Math_floor((tempDouble)/4294967296.0))), 4294967295.0))|0)>>>0 : (~~((+(Math_ceil((tempDouble - +(((~~(tempDouble)))>>>0))/4294967296.0)))))>>>0) : 0)],HEAP32[((ptr)>>2)]=tempI64[0],HEAP32[(((ptr)+(4))>>2)]=tempI64[1]); break;
      case 'float': HEAPF32[((ptr)>>2)]=value; break;
      case 'double': HEAPF64[((ptr)>>3)]=value; break;
      default: abort('invalid type for setValue: ' + type);
    }
}
Module["setValue"] = setValue;


function getValue(ptr, type, noSafe) {
  type = type || 'i8';
  if (type.charAt(type.length-1) === '*') type = 'i32'; // pointers are 32-bit
    switch(type) {
      case 'i1': return HEAP8[((ptr)>>0)];
      case 'i8': return HEAP8[((ptr)>>0)];
      case 'i16': return HEAP16[((ptr)>>1)];
      case 'i32': return HEAP32[((ptr)>>2)];
      case 'i64': return HEAP32[((ptr)>>2)];
      case 'float': return HEAPF32[((ptr)>>2)];
      case 'double': return HEAPF64[((ptr)>>3)];
      default: abort('invalid type for setValue: ' + type);
    }
  return null;
}
Module["getValue"] = getValue;

var ALLOC_NORMAL = 0; // Tries to use _malloc()
var ALLOC_STACK = 1; // Lives for the duration of the current function call
var ALLOC_STATIC = 2; // Cannot be freed
var ALLOC_DYNAMIC = 3; // Cannot be freed except through sbrk
var ALLOC_NONE = 4; // Do not allocate
Module["ALLOC_NORMAL"] = ALLOC_NORMAL;
Module["ALLOC_STACK"] = ALLOC_STACK;
Module["ALLOC_STATIC"] = ALLOC_STATIC;
Module["ALLOC_DYNAMIC"] = ALLOC_DYNAMIC;
Module["ALLOC_NONE"] = ALLOC_NONE;

// allocate(): This is for internal use. You can use it yourself as well, but the interface
//             is a little tricky (see docs right below). The reason is that it is optimized
//             for multiple syntaxes to save space in generated code. So you should
//             normally not use allocate(), and instead allocate memory using _malloc(),
//             initialize it with setValue(), and so forth.
// @slab: An array of data, or a number. If a number, then the size of the block to allocate,
//        in *bytes* (note that this is sometimes confusing: the next parameter does not
//        affect this!)
// @types: Either an array of types, one for each byte (or 0 if no type at that position),
//         or a single type which is used for the entire block. This only matters if there
//         is initial data - if @slab is a number, then this does not matter at all and is
//         ignored.
// @allocator: How to allocate memory, see ALLOC_*
function allocate(slab, types, allocator, ptr) {
  var zeroinit, size;
  if (typeof slab === 'number') {
    zeroinit = true;
    size = slab;
  } else {
    zeroinit = false;
    size = slab.length;
  }

  var singleType = typeof types === 'string' ? types : null;

  var ret;
  if (allocator == ALLOC_NONE) {
    ret = ptr;
  } else {
    ret = [typeof _malloc === 'function' ? _malloc : Runtime.staticAlloc, Runtime.stackAlloc, Runtime.staticAlloc, Runtime.dynamicAlloc][allocator === undefined ? ALLOC_STATIC : allocator](Math.max(size, singleType ? 1 : types.length));
  }

  if (zeroinit) {
    var ptr = ret, stop;
    assert((ret & 3) == 0);
    stop = ret + (size & ~3);
    for (; ptr < stop; ptr += 4) {
      HEAP32[((ptr)>>2)]=0;
    }
    stop = ret + size;
    while (ptr < stop) {
      HEAP8[((ptr++)>>0)]=0;
    }
    return ret;
  }

  if (singleType === 'i8') {
    if (slab.subarray || slab.slice) {
      HEAPU8.set(slab, ret);
    } else {
      HEAPU8.set(new Uint8Array(slab), ret);
    }
    return ret;
  }

  var i = 0, type, typeSize, previousType;
  while (i < size) {
    var curr = slab[i];

    if (typeof curr === 'function') {
      curr = Runtime.getFunctionIndex(curr);
    }

    type = singleType || types[i];
    if (type === 0) {
      i++;
      continue;
    }
    assert(type, 'Must know what type to store in allocate!');

    if (type == 'i64') type = 'i32'; // special case: we have one i32 here, and one i32 later

    setValue(ret+i, curr, type);

    // no need to look up size unless type changes, so cache it
    if (previousType !== type) {
      typeSize = Runtime.getNativeTypeSize(type);
      previousType = type;
    }
    i += typeSize;
  }

  return ret;
}
Module["allocate"] = allocate;

// Allocate memory during any stage of startup - static memory early on, dynamic memory later, malloc when ready
function getMemory(size) {
  if (!staticSealed) return Runtime.staticAlloc(size);
  if ((typeof _sbrk !== 'undefined' && !_sbrk.called) || !runtimeInitialized) return Runtime.dynamicAlloc(size);
  return _malloc(size);
}
Module["getMemory"] = getMemory;

function Pointer_stringify(ptr, /* optional */ length) {
  if (length === 0 || !ptr) return '';
  // TODO: use TextDecoder
  // Find the length, and check for UTF while doing so
  var hasUtf = 0;
  var t;
  var i = 0;
  while (1) {
    assert(ptr + i < TOTAL_MEMORY);
    t = HEAPU8[(((ptr)+(i))>>0)];
    hasUtf |= t;
    if (t == 0 && !length) break;
    i++;
    if (length && i == length) break;
  }
  if (!length) length = i;

  var ret = '';

  if (hasUtf < 128) {
    var MAX_CHUNK = 1024; // split up into chunks, because .apply on a huge string can overflow the stack
    var curr;
    while (length > 0) {
      curr = String.fromCharCode.apply(String, HEAPU8.subarray(ptr, ptr + Math.min(length, MAX_CHUNK)));
      ret = ret ? ret + curr : curr;
      ptr += MAX_CHUNK;
      length -= MAX_CHUNK;
    }
    return ret;
  }
  return Module['UTF8ToString'](ptr);
}
Module["Pointer_stringify"] = Pointer_stringify;

// Given a pointer 'ptr' to a null-terminated ASCII-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function AsciiToString(ptr) {
  var str = '';
  while (1) {
    var ch = HEAP8[((ptr++)>>0)];
    if (!ch) return str;
    str += String.fromCharCode(ch);
  }
}
Module["AsciiToString"] = AsciiToString;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in ASCII form. The copy will require at most str.length+1 bytes of space in the HEAP.

function stringToAscii(str, outPtr) {
  return writeAsciiToMemory(str, outPtr, false);
}
Module["stringToAscii"] = stringToAscii;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the given array that contains uint8 values, returns
// a copy of that string as a Javascript String object.

function UTF8ArrayToString(u8Array, idx) {
  var u0, u1, u2, u3, u4, u5;

  var str = '';
  while (1) {
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    u0 = u8Array[idx++];
    if (!u0) return str;
    if (!(u0 & 0x80)) { str += String.fromCharCode(u0); continue; }
    u1 = u8Array[idx++] & 63;
    if ((u0 & 0xE0) == 0xC0) { str += String.fromCharCode(((u0 & 31) << 6) | u1); continue; }
    u2 = u8Array[idx++] & 63;
    if ((u0 & 0xF0) == 0xE0) {
      u0 = ((u0 & 15) << 12) | (u1 << 6) | u2;
    } else {
      u3 = u8Array[idx++] & 63;
      if ((u0 & 0xF8) == 0xF0) {
        u0 = ((u0 & 7) << 18) | (u1 << 12) | (u2 << 6) | u3;
      } else {
        u4 = u8Array[idx++] & 63;
        if ((u0 & 0xFC) == 0xF8) {
          u0 = ((u0 & 3) << 24) | (u1 << 18) | (u2 << 12) | (u3 << 6) | u4;
        } else {
          u5 = u8Array[idx++] & 63;
          u0 = ((u0 & 1) << 30) | (u1 << 24) | (u2 << 18) | (u3 << 12) | (u4 << 6) | u5;
        }
      }
    }
    if (u0 < 0x10000) {
      str += String.fromCharCode(u0);
    } else {
      var ch = u0 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    }
  }
}
Module["UTF8ArrayToString"] = UTF8ArrayToString;

// Given a pointer 'ptr' to a null-terminated UTF8-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF8ToString(ptr) {
  return UTF8ArrayToString(HEAPU8,ptr);
}
Module["UTF8ToString"] = UTF8ToString;

// Copies the given Javascript String object 'str' to the given byte array at address 'outIdx',
// encoded in UTF8 form and null-terminated. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outU8Array: the array to copy to. Each index in this array is assumed to be one 8-byte element.
//   outIdx: The starting offset in the array to begin the copying.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null 
//                    terminator, i.e. if maxBytesToWrite=1, only the null terminator will be written and nothing else.
//                    maxBytesToWrite=0 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8Array(str, outU8Array, outIdx, maxBytesToWrite) {
  if (!(maxBytesToWrite > 0)) // Parameter maxBytesToWrite is not optional. Negative values, 0, null, undefined and false each don't write out any bytes.
    return 0;

  var startIdx = outIdx;
  var endIdx = outIdx + maxBytesToWrite - 1; // -1 for string null terminator.
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    // For UTF8 byte structure, see http://en.wikipedia.org/wiki/UTF-8#Description and https://www.ietf.org/rfc/rfc2279.txt and https://tools.ietf.org/html/rfc3629
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      if (outIdx >= endIdx) break;
      outU8Array[outIdx++] = u;
    } else if (u <= 0x7FF) {
      if (outIdx + 1 >= endIdx) break;
      outU8Array[outIdx++] = 0xC0 | (u >> 6);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0xFFFF) {
      if (outIdx + 2 >= endIdx) break;
      outU8Array[outIdx++] = 0xE0 | (u >> 12);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x1FFFFF) {
      if (outIdx + 3 >= endIdx) break;
      outU8Array[outIdx++] = 0xF0 | (u >> 18);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else if (u <= 0x3FFFFFF) {
      if (outIdx + 4 >= endIdx) break;
      outU8Array[outIdx++] = 0xF8 | (u >> 24);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    } else {
      if (outIdx + 5 >= endIdx) break;
      outU8Array[outIdx++] = 0xFC | (u >> 30);
      outU8Array[outIdx++] = 0x80 | ((u >> 24) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 18) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 12) & 63);
      outU8Array[outIdx++] = 0x80 | ((u >> 6) & 63);
      outU8Array[outIdx++] = 0x80 | (u & 63);
    }
  }
  // Null-terminate the pointer to the buffer.
  outU8Array[outIdx] = 0;
  return outIdx - startIdx;
}
Module["stringToUTF8Array"] = stringToUTF8Array;

// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF8 form. The copy will require at most str.length*4+1 bytes of space in the HEAP.
// Use the function lengthBytesUTF8() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF8(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF8(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  return stringToUTF8Array(str, HEAPU8,outPtr, maxBytesToWrite);
}
Module["stringToUTF8"] = stringToUTF8;

// Returns the number of bytes the given Javascript string takes if encoded as a UTF8 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF8(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! So decode UTF16->UTF32->UTF8.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var u = str.charCodeAt(i); // possibly a lead surrogate
    if (u >= 0xD800 && u <= 0xDFFF) u = 0x10000 + ((u & 0x3FF) << 10) | (str.charCodeAt(++i) & 0x3FF);
    if (u <= 0x7F) {
      ++len;
    } else if (u <= 0x7FF) {
      len += 2;
    } else if (u <= 0xFFFF) {
      len += 3;
    } else if (u <= 0x1FFFFF) {
      len += 4;
    } else if (u <= 0x3FFFFFF) {
      len += 5;
    } else {
      len += 6;
    }
  }
  return len;
}
Module["lengthBytesUTF8"] = lengthBytesUTF8;

// Given a pointer 'ptr' to a null-terminated UTF16LE-encoded string in the emscripten HEAP, returns
// a copy of that string as a Javascript String object.

function UTF16ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var codeUnit = HEAP16[(((ptr)+(i*2))>>1)];
    if (codeUnit == 0)
      return str;
    ++i;
    // fromCharCode constructs a character from a UTF-16 code unit, so we can pass the UTF16 string right through.
    str += String.fromCharCode(codeUnit);
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF16 form. The copy will require at most str.length*4+2 bytes of space in the HEAP.
// Use the function lengthBytesUTF16() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null 
//                    terminator, i.e. if maxBytesToWrite=2, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<2 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF16(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF16(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 2) return 0;
  maxBytesToWrite -= 2; // Null terminator.
  var startPtr = outPtr;
  var numCharsToWrite = (maxBytesToWrite < str.length*2) ? (maxBytesToWrite / 2) : str.length;
  for (var i = 0; i < numCharsToWrite; ++i) {
    // charCodeAt returns a UTF-16 encoded code unit, so it can be directly written to the HEAP.
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    HEAP16[((outPtr)>>1)]=codeUnit;
    outPtr += 2;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP16[((outPtr)>>1)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF16(str) {
  return str.length*2;
}


function UTF32ToString(ptr) {
  var i = 0;

  var str = '';
  while (1) {
    var utf32 = HEAP32[(((ptr)+(i*4))>>2)];
    if (utf32 == 0)
      return str;
    ++i;
    // Gotcha: fromCharCode constructs a character from a UTF-16 encoded code (pair), not from a Unicode code point! So encode the code point to UTF-16 for constructing.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    if (utf32 >= 0x10000) {
      var ch = utf32 - 0x10000;
      str += String.fromCharCode(0xD800 | (ch >> 10), 0xDC00 | (ch & 0x3FF));
    } else {
      str += String.fromCharCode(utf32);
    }
  }
}


// Copies the given Javascript String object 'str' to the emscripten HEAP at address 'outPtr',
// null-terminated and encoded in UTF32 form. The copy will require at most str.length*4+4 bytes of space in the HEAP.
// Use the function lengthBytesUTF32() to compute the exact number of bytes (excluding null terminator) that this function will write.
// Parameters:
//   str: the Javascript string to copy.
//   outPtr: Byte address in Emscripten HEAP where to write the string to.
//   maxBytesToWrite: The maximum number of bytes this function can write to the array. This count should include the null 
//                    terminator, i.e. if maxBytesToWrite=4, only the null terminator will be written and nothing else.
//                    maxBytesToWrite<4 does not write any bytes to the output, not even the null terminator.
// Returns the number of bytes written, EXCLUDING the null terminator.

function stringToUTF32(str, outPtr, maxBytesToWrite) {
  assert(typeof maxBytesToWrite == 'number', 'stringToUTF32(str, outPtr, maxBytesToWrite) is missing the third parameter that specifies the length of the output buffer!');
  // Backwards compatibility: if max bytes is not specified, assume unsafe unbounded write is allowed.
  if (maxBytesToWrite === undefined) {
    maxBytesToWrite = 0x7FFFFFFF;
  }
  if (maxBytesToWrite < 4) return 0;
  var startPtr = outPtr;
  var endPtr = startPtr + maxBytesToWrite - 4;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i); // possibly a lead surrogate
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) {
      var trailSurrogate = str.charCodeAt(++i);
      codeUnit = 0x10000 + ((codeUnit & 0x3FF) << 10) | (trailSurrogate & 0x3FF);
    }
    HEAP32[((outPtr)>>2)]=codeUnit;
    outPtr += 4;
    if (outPtr + 4 > endPtr) break;
  }
  // Null-terminate the pointer to the HEAP.
  HEAP32[((outPtr)>>2)]=0;
  return outPtr - startPtr;
}


// Returns the number of bytes the given Javascript string takes if encoded as a UTF16 byte array, EXCLUDING the null terminator byte.

function lengthBytesUTF32(str) {
  var len = 0;
  for (var i = 0; i < str.length; ++i) {
    // Gotcha: charCodeAt returns a 16-bit word that is a UTF-16 encoded code unit, not a Unicode code point of the character! We must decode the string to UTF-32 to the heap.
    // See http://unicode.org/faq/utf_bom.html#utf16-3
    var codeUnit = str.charCodeAt(i);
    if (codeUnit >= 0xD800 && codeUnit <= 0xDFFF) ++i; // possibly a lead surrogate, so skip over the tail surrogate.
    len += 4;
  }

  return len;
}


function demangle(func) {
  var hasLibcxxabi = !!Module['___cxa_demangle'];
  if (hasLibcxxabi) {
    try {
      var buf = _malloc(func.length);
      writeStringToMemory(func.substr(1), buf);
      var status = _malloc(4);
      var ret = Module['___cxa_demangle'](buf, 0, 0, status);
      if (getValue(status, 'i32') === 0 && ret) {
        return Pointer_stringify(ret);
      }
      // otherwise, libcxxabi failed, we can try ours which may return a partial result
    } catch(e) {
      // failure when using libcxxabi, we can try ours which may return a partial result
      return func;
    } finally {
      if (buf) _free(buf);
      if (status) _free(status);
      if (ret) _free(ret);
    }
  }
  Runtime.warnOnce('warning: build with  -s DEMANGLE_SUPPORT=1  to link in libcxxabi demangling');
  return func;
}

function demangleAll(text) {
  return text.replace(/__Z[\w\d_]+/g, function(x) { var y = demangle(x); return x === y ? x : (x + ' [' + y + ']') });
}

function jsStackTrace() {
  var err = new Error();
  if (!err.stack) {
    // IE10+ special cases: It does have callstack info, but it is only populated if an Error object is thrown,
    // so try that as a special-case.
    try {
      throw new Error(0);
    } catch(e) {
      err = e;
    }
    if (!err.stack) {
      return '(no stack trace available)';
    }
  }
  return err.stack.toString();
}

function stackTrace() {
  return demangleAll(jsStackTrace());
}
Module["stackTrace"] = stackTrace;

// Memory management

var PAGE_SIZE = 4096;

function alignMemoryPage(x) {
  if (x % 4096 > 0) {
    x += (4096 - (x % 4096));
  }
  return x;
}

var HEAP;
var buffer;
var HEAP8, HEAPU8, HEAP16, HEAPU16, HEAP32, HEAPU32, HEAPF32, HEAPF64;

function updateGlobalBuffer(buf) {
  Module['buffer'] = buffer = buf;
}

function updateGlobalBufferViews() {
  Module['HEAP8'] = HEAP8 = new Int8Array(buffer);
  Module['HEAP16'] = HEAP16 = new Int16Array(buffer);
  Module['HEAP32'] = HEAP32 = new Int32Array(buffer);
  Module['HEAPU8'] = HEAPU8 = new Uint8Array(buffer);
  Module['HEAPU16'] = HEAPU16 = new Uint16Array(buffer);
  Module['HEAPU32'] = HEAPU32 = new Uint32Array(buffer);
  Module['HEAPF32'] = HEAPF32 = new Float32Array(buffer);
  Module['HEAPF64'] = HEAPF64 = new Float64Array(buffer);
}

var STATIC_BASE = 0, STATICTOP = 0, staticSealed = false; // static area
var STACK_BASE = 0, STACKTOP = 0, STACK_MAX = 0; // stack area
var DYNAMIC_BASE = 0, DYNAMICTOP = 0; // dynamic area handled by sbrk


function abortOnCannotGrowMemory() {
  abort('Cannot enlarge memory arrays. Either (1) compile with  -s TOTAL_MEMORY=X  with X higher than the current value ' + TOTAL_MEMORY + ', (2) compile with  -s ALLOW_MEMORY_GROWTH=1  which adjusts the size at runtime but prevents some optimizations, (3) set Module.TOTAL_MEMORY to a higher value before the program runs, or if you want malloc to return NULL (0) instead of this abort, compile with  -s ABORTING_MALLOC=0 ');
}

function enlargeMemory() {
  abortOnCannotGrowMemory();
}


var TOTAL_STACK = Module['TOTAL_STACK'] || 5242880;
var TOTAL_MEMORY = Module['TOTAL_MEMORY'] || 16777216;

var totalMemory = 64*1024;
while (totalMemory < TOTAL_MEMORY || totalMemory < 2*TOTAL_STACK) {
  if (totalMemory < 16*1024*1024) {
    totalMemory *= 2;
  } else {
    totalMemory += 16*1024*1024
  }
}
if (totalMemory !== TOTAL_MEMORY) {
  Module.printErr('increasing TOTAL_MEMORY to ' + totalMemory + ' to be compliant with the asm.js spec (and given that TOTAL_STACK=' + TOTAL_STACK + ')');
  TOTAL_MEMORY = totalMemory;
}

// Initialize the runtime's memory
// check for full engine support (use string 'subarray' to avoid closure compiler confusion)
assert(typeof Int32Array !== 'undefined' && typeof Float64Array !== 'undefined' && !!(new Int32Array(1)['subarray']) && !!(new Int32Array(1)['set']),
       'JS engine does not provide full typed array support');



// Use a provided buffer, if there is one, or else allocate a new one
if (Module['buffer']) {
  buffer = Module['buffer'];
  assert(buffer.byteLength === TOTAL_MEMORY, 'provided buffer should be ' + TOTAL_MEMORY + ' bytes, but it is ' + buffer.byteLength);
} else {
  buffer = new ArrayBuffer(TOTAL_MEMORY);
}
updateGlobalBufferViews();


// Endianness check (note: assumes compiler arch was little-endian)
HEAP32[0] = 255;
if (HEAPU8[0] !== 255 || HEAPU8[3] !== 0) throw 'Typed arrays 2 must be run on a little-endian system';

Module['HEAP'] = HEAP;
Module['buffer'] = buffer;
Module['HEAP8'] = HEAP8;
Module['HEAP16'] = HEAP16;
Module['HEAP32'] = HEAP32;
Module['HEAPU8'] = HEAPU8;
Module['HEAPU16'] = HEAPU16;
Module['HEAPU32'] = HEAPU32;
Module['HEAPF32'] = HEAPF32;
Module['HEAPF64'] = HEAPF64;

function callRuntimeCallbacks(callbacks) {
  while(callbacks.length > 0) {
    var callback = callbacks.shift();
    if (typeof callback == 'function') {
      callback();
      continue;
    }
    var func = callback.func;
    if (typeof func === 'number') {
      if (callback.arg === undefined) {
        Runtime.dynCall('v', func);
      } else {
        Runtime.dynCall('vi', func, [callback.arg]);
      }
    } else {
      func(callback.arg === undefined ? null : callback.arg);
    }
  }
}

var __ATPRERUN__  = []; // functions called before the runtime is initialized
var __ATINIT__    = []; // functions called during startup
var __ATMAIN__    = []; // functions called when main() is to be run
var __ATEXIT__    = []; // functions called during shutdown
var __ATPOSTRUN__ = []; // functions called after the runtime has exited

var runtimeInitialized = false;
var runtimeExited = false;


function preRun() {
  // compatibility - merge in anything from Module['preRun'] at this time
  if (Module['preRun']) {
    if (typeof Module['preRun'] == 'function') Module['preRun'] = [Module['preRun']];
    while (Module['preRun'].length) {
      addOnPreRun(Module['preRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPRERUN__);
}

function ensureInitRuntime() {
  if (runtimeInitialized) return;
  runtimeInitialized = true;
  callRuntimeCallbacks(__ATINIT__);
}

function preMain() {
  callRuntimeCallbacks(__ATMAIN__);
}

function exitRuntime() {
  callRuntimeCallbacks(__ATEXIT__);
  runtimeExited = true;
}

function postRun() {
  // compatibility - merge in anything from Module['postRun'] at this time
  if (Module['postRun']) {
    if (typeof Module['postRun'] == 'function') Module['postRun'] = [Module['postRun']];
    while (Module['postRun'].length) {
      addOnPostRun(Module['postRun'].shift());
    }
  }
  callRuntimeCallbacks(__ATPOSTRUN__);
}

function addOnPreRun(cb) {
  __ATPRERUN__.unshift(cb);
}
Module["addOnPreRun"] = addOnPreRun;

function addOnInit(cb) {
  __ATINIT__.unshift(cb);
}
Module["addOnInit"] = addOnInit;

function addOnPreMain(cb) {
  __ATMAIN__.unshift(cb);
}
Module["addOnPreMain"] = addOnPreMain;

function addOnExit(cb) {
  __ATEXIT__.unshift(cb);
}
Module["addOnExit"] = addOnExit;

function addOnPostRun(cb) {
  __ATPOSTRUN__.unshift(cb);
}
Module["addOnPostRun"] = addOnPostRun;

// Tools


function intArrayFromString(stringy, dontAddNull, length /* optional */) {
  var len = length > 0 ? length : lengthBytesUTF8(stringy)+1;
  var u8array = new Array(len);
  var numBytesWritten = stringToUTF8Array(stringy, u8array, 0, u8array.length);
  if (dontAddNull) u8array.length = numBytesWritten;
  return u8array;
}
Module["intArrayFromString"] = intArrayFromString;

function intArrayToString(array) {
  var ret = [];
  for (var i = 0; i < array.length; i++) {
    var chr = array[i];
    if (chr > 0xFF) {
      assert(false, 'Character code ' + chr + ' (' + String.fromCharCode(chr) + ')  at offset ' + i + ' not in 0x00-0xFF.');
      chr &= 0xFF;
    }
    ret.push(String.fromCharCode(chr));
  }
  return ret.join('');
}
Module["intArrayToString"] = intArrayToString;

function writeStringToMemory(string, buffer, dontAddNull) {
  var array = intArrayFromString(string, dontAddNull);
  var i = 0;
  while (i < array.length) {
    var chr = array[i];
    HEAP8[(((buffer)+(i))>>0)]=chr;
    i = i + 1;
  }
}
Module["writeStringToMemory"] = writeStringToMemory;

function writeArrayToMemory(array, buffer) {
  for (var i = 0; i < array.length; i++) {
    HEAP8[((buffer++)>>0)]=array[i];
  }
}
Module["writeArrayToMemory"] = writeArrayToMemory;

function writeAsciiToMemory(str, buffer, dontAddNull) {
  for (var i = 0; i < str.length; ++i) {
    assert(str.charCodeAt(i) === str.charCodeAt(i)&0xff);
    HEAP8[((buffer++)>>0)]=str.charCodeAt(i);
  }
  // Null-terminate the pointer to the HEAP.
  if (!dontAddNull) HEAP8[((buffer)>>0)]=0;
}
Module["writeAsciiToMemory"] = writeAsciiToMemory;

function unSign(value, bits, ignore) {
  if (value >= 0) {
    return value;
  }
  return bits <= 32 ? 2*Math.abs(1 << (bits-1)) + value // Need some trickery, since if bits == 32, we are right at the limit of the bits JS uses in bitshifts
                    : Math.pow(2, bits)         + value;
}
function reSign(value, bits, ignore) {
  if (value <= 0) {
    return value;
  }
  var half = bits <= 32 ? Math.abs(1 << (bits-1)) // abs is needed if bits == 32
                        : Math.pow(2, bits-1);
  if (value >= half && (bits <= 32 || value > half)) { // for huge values, we can hit the precision limit and always get true here. so don't do that
                                                       // but, in general there is no perfect solution here. With 64-bit ints, we get rounding and errors
                                                       // TODO: In i64 mode 1, resign the two parts separately and safely
    value = -2*half + value; // Cannot bitshift half, as it may be at the limit of the bits JS uses in bitshifts
  }
  return value;
}


// check for imul support, and also for correctness ( https://bugs.webkit.org/show_bug.cgi?id=126345 )
if (!Math['imul'] || Math['imul'](0xffffffff, 5) !== -5) Math['imul'] = function imul(a, b) {
  var ah  = a >>> 16;
  var al = a & 0xffff;
  var bh  = b >>> 16;
  var bl = b & 0xffff;
  return (al*bl + ((ah*bl + al*bh) << 16))|0;
};
Math.imul = Math['imul'];


if (!Math['clz32']) Math['clz32'] = function(x) {
  x = x >>> 0;
  for (var i = 0; i < 32; i++) {
    if (x & (1 << (31 - i))) return i;
  }
  return 32;
};
Math.clz32 = Math['clz32']

var Math_abs = Math.abs;
var Math_cos = Math.cos;
var Math_sin = Math.sin;
var Math_tan = Math.tan;
var Math_acos = Math.acos;
var Math_asin = Math.asin;
var Math_atan = Math.atan;
var Math_atan2 = Math.atan2;
var Math_exp = Math.exp;
var Math_log = Math.log;
var Math_sqrt = Math.sqrt;
var Math_ceil = Math.ceil;
var Math_floor = Math.floor;
var Math_pow = Math.pow;
var Math_imul = Math.imul;
var Math_fround = Math.fround;
var Math_min = Math.min;
var Math_clz32 = Math.clz32;

// A counter of dependencies for calling run(). If we need to
// do asynchronous work before running, increment this and
// decrement it. Incrementing must happen in a place like
// PRE_RUN_ADDITIONS (used by emcc to add file preloading).
// Note that you can add dependencies in preRun, even though
// it happens right before run - run will be postponed until
// the dependencies are met.
var runDependencies = 0;
var runDependencyWatcher = null;
var dependenciesFulfilled = null; // overridden to take different actions when all run dependencies are fulfilled
var runDependencyTracking = {};

function getUniqueRunDependency(id) {
  var orig = id;
  while (1) {
    if (!runDependencyTracking[id]) return id;
    id = orig + Math.random();
  }
  return id;
}

function addRunDependency(id) {
  runDependencies++;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(!runDependencyTracking[id]);
    runDependencyTracking[id] = 1;
    if (runDependencyWatcher === null && typeof setInterval !== 'undefined') {
      // Check for missing dependencies every few seconds
      runDependencyWatcher = setInterval(function() {
        if (ABORT) {
          clearInterval(runDependencyWatcher);
          runDependencyWatcher = null;
          return;
        }
        var shown = false;
        for (var dep in runDependencyTracking) {
          if (!shown) {
            shown = true;
            Module.printErr('still waiting on run dependencies:');
          }
          Module.printErr('dependency: ' + dep);
        }
        if (shown) {
          Module.printErr('(end of list)');
        }
      }, 10000);
    }
  } else {
    Module.printErr('warning: run dependency added without ID');
  }
}
Module["addRunDependency"] = addRunDependency;

function removeRunDependency(id) {
  runDependencies--;
  if (Module['monitorRunDependencies']) {
    Module['monitorRunDependencies'](runDependencies);
  }
  if (id) {
    assert(runDependencyTracking[id]);
    delete runDependencyTracking[id];
  } else {
    Module.printErr('warning: run dependency removed without ID');
  }
  if (runDependencies == 0) {
    if (runDependencyWatcher !== null) {
      clearInterval(runDependencyWatcher);
      runDependencyWatcher = null;
    }
    if (dependenciesFulfilled) {
      var callback = dependenciesFulfilled;
      dependenciesFulfilled = null;
      callback(); // can add another dependenciesFulfilled
    }
  }
}
Module["removeRunDependency"] = removeRunDependency;

Module["preloadedImages"] = {}; // maps url to image data
Module["preloadedAudios"] = {}; // maps url to audio data



var memoryInitializer = null;



var /* show errors on likely calls to FS when it was not included */ FS = {
  error: function() {
    abort('Filesystem support (FS) was not included. The problem is that you are using files from JS, but files were not used from C/C++, so filesystem support was not auto-included. You can force-include filesystem support with  -s FORCE_FILESYSTEM=1');
  },
  init: function() { FS.error() },
  createDataFile: function() { FS.error() },
  createPreloadedFile: function() { FS.error() },
  createLazyFile: function() { FS.error() },
  open: function() { FS.error() },
  mkdev: function() { FS.error() },
  registerDevice: function() { FS.error() },
  analyzePath: function() { FS.error() },
  loadFilesFromDB: function() { FS.error() },

  ErrnoError: function ErrnoError() { FS.error() },
};
Module['FS_createDataFile'] = FS.createDataFile;
Module['FS_createPreloadedFile'] = FS.createPreloadedFile;

// === Body ===

var ASM_CONSTS = [];




STATIC_BASE = 8;

STATICTOP = STATIC_BASE + 19424;
  /* global initializers */  __ATINIT__.push({ func: function() { __GLOBAL__sub_I_object_type_db_cpp() } }, { func: function() { __GLOBAL__sub_I_resource_cpp() } }, { func: function() { __GLOBAL__sub_I_object_cpp() } }, { func: function() { __GLOBAL__sub_I_matrix3_cpp() } });
  

/* memory initializer */ allocate([5,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,0,0,3,0,0,0,219,71,0,0,0,4,0,0,0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,10,255,255,255,255,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,8,0,0,0,67,111,110,100,105,116,105,111,110,32,39,32,33,112,95,73,32,39,32,105,115,32,116,114,117,101,46,32,114,101,116,117,114,110,101,100,58,32,102,97,108,115,101,0,101,114,97,115,101,0,99,111,114,101,47,108,105,115,116,46,104,0,67,111,110,100,105,116,105,111,110,32,39,32,112,95,73,45,62,100,97,116,97,33,61,116,104,105,115,32,39,32,105,115,32,116,114,117,101,46,32,114,101,116,117,114,110,101,100,58,32,102,97,108,115,101,0,126,76,105,115,116,0,67,111,110,100,105,116,105,111,110,32,39,32,95,100,97,116,97,45,62,115,105,122,101,95,99,97,99,104,101,32,39,32,105,115,32,116,114,117,101,46,0,99,111,114,101,47,115,116,114,105,110,103,95,100,98,46,99,112,112,0,67,111,110,100,105,116,105,111,110,32,39,32,33,99,111,110,102,105,103,117,114,101,100,32,39,32,105,115,32,116,114,117,101,46,0,117,110,114,101,102,0,66,85,71,33,0,95,117,110,114,101,102,0,99,111,114,101,47,100,105,99,116,105,111,110,97,114,121,46,99,112,112,0,67,111,110,100,105,116,105,111,110,32,39,32,33,95,112,32,39,32,105,115,32,116,114,117,101,46,0,99,111,114,101,47,111,115,47,109,101,109,111,114,121,46,99,112,112,0,102,114,101,101,95,115,116,97,116,105,99,0,67,111,110,100,105,116,105,111,110,32,39,32,33,77,101,109,111,114,121,80,111,111,108,83,116,97,116,105,99,58,58,103,101,116,95,115,105,110,103,108,101,116,111,110,40,41,32,39,32,105,115,32,116,114,117,101,46,0], "i8", ALLOC_NONE, Runtime.GLOBAL_BASE);





/* no memory initializer */
var tempDoublePtr = STATICTOP; STATICTOP += 16;

assert(tempDoublePtr % 8 == 0);

function copyTempFloat(ptr) { // functions, because inlining this code increases code size too much

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

}

function copyTempDouble(ptr) {

  HEAP8[tempDoublePtr] = HEAP8[ptr];

  HEAP8[tempDoublePtr+1] = HEAP8[ptr+1];

  HEAP8[tempDoublePtr+2] = HEAP8[ptr+2];

  HEAP8[tempDoublePtr+3] = HEAP8[ptr+3];

  HEAP8[tempDoublePtr+4] = HEAP8[ptr+4];

  HEAP8[tempDoublePtr+5] = HEAP8[ptr+5];

  HEAP8[tempDoublePtr+6] = HEAP8[ptr+6];

  HEAP8[tempDoublePtr+7] = HEAP8[ptr+7];

}

// {{PRE_LIBRARY}}


  
  function _atexit(func, arg) {
      __ATEXIT__.unshift({ func: func, arg: arg });
    }function ___cxa_atexit() {
  return _atexit.apply(null, arguments)
  }

  
  function ___setErrNo(value) {
      if (Module['___errno_location']) HEAP32[((Module['___errno_location']())>>2)]=value;
      else Module.printErr('failed to set errno from JS');
      return value;
    }
  
  var ERRNO_CODES={EPERM:1,ENOENT:2,ESRCH:3,EINTR:4,EIO:5,ENXIO:6,E2BIG:7,ENOEXEC:8,EBADF:9,ECHILD:10,EAGAIN:11,EWOULDBLOCK:11,ENOMEM:12,EACCES:13,EFAULT:14,ENOTBLK:15,EBUSY:16,EEXIST:17,EXDEV:18,ENODEV:19,ENOTDIR:20,EISDIR:21,EINVAL:22,ENFILE:23,EMFILE:24,ENOTTY:25,ETXTBSY:26,EFBIG:27,ENOSPC:28,ESPIPE:29,EROFS:30,EMLINK:31,EPIPE:32,EDOM:33,ERANGE:34,ENOMSG:42,EIDRM:43,ECHRNG:44,EL2NSYNC:45,EL3HLT:46,EL3RST:47,ELNRNG:48,EUNATCH:49,ENOCSI:50,EL2HLT:51,EDEADLK:35,ENOLCK:37,EBADE:52,EBADR:53,EXFULL:54,ENOANO:55,EBADRQC:56,EBADSLT:57,EDEADLOCK:35,EBFONT:59,ENOSTR:60,ENODATA:61,ETIME:62,ENOSR:63,ENONET:64,ENOPKG:65,EREMOTE:66,ENOLINK:67,EADV:68,ESRMNT:69,ECOMM:70,EPROTO:71,EMULTIHOP:72,EDOTDOT:73,EBADMSG:74,ENOTUNIQ:76,EBADFD:77,EREMCHG:78,ELIBACC:79,ELIBBAD:80,ELIBSCN:81,ELIBMAX:82,ELIBEXEC:83,ENOSYS:38,ENOTEMPTY:39,ENAMETOOLONG:36,ELOOP:40,EOPNOTSUPP:95,EPFNOSUPPORT:96,ECONNRESET:104,ENOBUFS:105,EAFNOSUPPORT:97,EPROTOTYPE:91,ENOTSOCK:88,ENOPROTOOPT:92,ESHUTDOWN:108,ECONNREFUSED:111,EADDRINUSE:98,ECONNABORTED:103,ENETUNREACH:101,ENETDOWN:100,ETIMEDOUT:110,EHOSTDOWN:112,EHOSTUNREACH:113,EINPROGRESS:115,EALREADY:114,EDESTADDRREQ:89,EMSGSIZE:90,EPROTONOSUPPORT:93,ESOCKTNOSUPPORT:94,EADDRNOTAVAIL:99,ENETRESET:102,EISCONN:106,ENOTCONN:107,ETOOMANYREFS:109,EUSERS:87,EDQUOT:122,ESTALE:116,ENOTSUP:95,ENOMEDIUM:123,EILSEQ:84,EOVERFLOW:75,ECANCELED:125,ENOTRECOVERABLE:131,EOWNERDEAD:130,ESTRPIPE:86};function _sysconf(name) {
      // long sysconf(int name);
      // http://pubs.opengroup.org/onlinepubs/009695399/functions/sysconf.html
      switch(name) {
        case 30: return PAGE_SIZE;
        case 85: return totalMemory / PAGE_SIZE;
        case 132:
        case 133:
        case 12:
        case 137:
        case 138:
        case 15:
        case 235:
        case 16:
        case 17:
        case 18:
        case 19:
        case 20:
        case 149:
        case 13:
        case 10:
        case 236:
        case 153:
        case 9:
        case 21:
        case 22:
        case 159:
        case 154:
        case 14:
        case 77:
        case 78:
        case 139:
        case 80:
        case 81:
        case 82:
        case 68:
        case 67:
        case 164:
        case 11:
        case 29:
        case 47:
        case 48:
        case 95:
        case 52:
        case 51:
        case 46:
          return 200809;
        case 79:
          return 0;
        case 27:
        case 246:
        case 127:
        case 128:
        case 23:
        case 24:
        case 160:
        case 161:
        case 181:
        case 182:
        case 242:
        case 183:
        case 184:
        case 243:
        case 244:
        case 245:
        case 165:
        case 178:
        case 179:
        case 49:
        case 50:
        case 168:
        case 169:
        case 175:
        case 170:
        case 171:
        case 172:
        case 97:
        case 76:
        case 32:
        case 173:
        case 35:
          return -1;
        case 176:
        case 177:
        case 7:
        case 155:
        case 8:
        case 157:
        case 125:
        case 126:
        case 92:
        case 93:
        case 129:
        case 130:
        case 131:
        case 94:
        case 91:
          return 1;
        case 74:
        case 60:
        case 69:
        case 70:
        case 4:
          return 1024;
        case 31:
        case 42:
        case 72:
          return 32;
        case 87:
        case 26:
        case 33:
          return 2147483647;
        case 34:
        case 1:
          return 47839;
        case 38:
        case 36:
          return 99;
        case 43:
        case 37:
          return 2048;
        case 0: return 2097152;
        case 3: return 65536;
        case 28: return 32768;
        case 44: return 32767;
        case 75: return 16384;
        case 39: return 1000;
        case 89: return 700;
        case 71: return 256;
        case 40: return 255;
        case 2: return 100;
        case 180: return 64;
        case 25: return 20;
        case 5: return 16;
        case 6: return 6;
        case 73: return 4;
        case 84: {
          if (typeof navigator === 'object') return navigator['hardwareConcurrency'] || 1;
          return 1;
        }
      }
      ___setErrNo(ERRNO_CODES.EINVAL);
      return -1;
    }

   
  Module["_memset"] = _memset;

  function _pthread_cleanup_push(routine, arg) {
      __ATEXIT__.push(function() { Runtime.dynCall('vi', routine, [arg]) })
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

  function _pthread_cleanup_pop() {
      assert(_pthread_cleanup_push.level == __ATEXIT__.length, 'cannot pop if something else added meanwhile!');
      __ATEXIT__.pop();
      _pthread_cleanup_push.level = __ATEXIT__.length;
    }

  function _abort() {
      Module['abort']();
    }

  function ___lock() {}

  function ___unlock() {}

  
  var SYSCALLS={varargs:0,get:function (varargs) {
        SYSCALLS.varargs += 4;
        var ret = HEAP32[(((SYSCALLS.varargs)-(4))>>2)];
        return ret;
      },getStr:function () {
        var ret = Pointer_stringify(SYSCALLS.get());
        return ret;
      },get64:function () {
        var low = SYSCALLS.get(), high = SYSCALLS.get();
        if (low >= 0) assert(high === 0);
        else assert(high === -1);
        return low;
      },getZero:function () {
        assert(SYSCALLS.get() === 0);
      }};function ___syscall6(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // close
      var stream = SYSCALLS.getStreamFromFD();
      FS.close(stream);
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function _sbrk(bytes) {
      // Implement a Linux-like 'memory area' for our 'process'.
      // Changes the size of the memory area by |bytes|; returns the
      // address of the previous top ('break') of the memory area
      // We control the "dynamic" memory - DYNAMIC_BASE to DYNAMICTOP
      var self = _sbrk;
      if (!self.called) {
        DYNAMICTOP = alignMemoryPage(DYNAMICTOP); // make sure we start out aligned
        self.called = true;
        assert(Runtime.dynamicAlloc);
        self.alloc = Runtime.dynamicAlloc;
        Runtime.dynamicAlloc = function() { abort('cannot dynamically allocate, sbrk now has control') };
      }
      var ret = DYNAMICTOP;
      if (bytes != 0) {
        var success = self.alloc(bytes);
        if (!success) return -1 >>> 0; // sbrk failure code
      }
      return ret;  // Previous break location.
    }

  
  function _emscripten_memcpy_big(dest, src, num) {
      HEAPU8.set(HEAPU8.subarray(src, src+num), dest);
      return dest;
    } 
  Module["_memcpy"] = _memcpy;

  function _time(ptr) {
      var ret = (Date.now()/1000)|0;
      if (ptr) {
        HEAP32[((ptr)>>2)]=ret;
      }
      return ret;
    }

  function _pthread_self() {
      //FIXME: assumes only a single thread
      return 0;
    }

  function ___syscall140(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // llseek
      var stream = SYSCALLS.getStreamFromFD(), offset_high = SYSCALLS.get(), offset_low = SYSCALLS.get(), result = SYSCALLS.get(), whence = SYSCALLS.get();
      var offset = offset_low;
      assert(offset_high === 0);
      FS.llseek(stream, offset, whence);
      HEAP32[((result)>>2)]=stream.position;
      if (stream.getdents && offset === 0 && whence === 0) stream.getdents = null; // reset readdir state
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall146(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // writev
      // hack to support printf in NO_FILESYSTEM
      var stream = SYSCALLS.get(), iov = SYSCALLS.get(), iovcnt = SYSCALLS.get();
      var ret = 0;
      if (!___syscall146.buffer) {
        ___syscall146.buffers = [null, [], []]; // 1 => stdout, 2 => stderr
        ___syscall146.printChar = function(stream, curr) {
          var buffer = ___syscall146.buffers[stream];
          assert(buffer);
          if (curr === 0 || curr === 10) {
            (stream === 1 ? Module['print'] : Module['printErr'])(UTF8ArrayToString(buffer, 0));
            buffer.length = 0;
          } else {
            buffer.push(curr);
          }
        };
      }
      for (var i = 0; i < iovcnt; i++) {
        var ptr = HEAP32[(((iov)+(i*8))>>2)];
        var len = HEAP32[(((iov)+(i*8 + 4))>>2)];
        for (var j = 0; j < len; j++) {
          ___syscall146.printChar(stream, HEAPU8[ptr+j]);
        }
        ret += len;
      }
      return ret;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  function ___syscall54(which, varargs) {SYSCALLS.varargs = varargs;
  try {
   // ioctl
      return 0;
    } catch (e) {
    if (typeof FS === 'undefined' || !(e instanceof FS.ErrnoError)) abort(e);
    return -e.errno;
  }
  }

  var ___dso_handle=STATICTOP; STATICTOP += 16;;
/* flush anything remaining in the buffer during shutdown */ __ATEXIT__.push(function() { var fflush = Module["_fflush"]; if (fflush) fflush(0); var printChar = ___syscall146.printChar; if (!printChar) return; var buffers = ___syscall146.buffers; if (buffers[1].length) printChar(1, 10); if (buffers[2].length) printChar(2, 10); });;
STACK_BASE = STACKTOP = Runtime.alignMemory(STATICTOP);

staticSealed = true; // seal the static portion of memory

STACK_MAX = STACK_BASE + TOTAL_STACK;

DYNAMIC_BASE = DYNAMICTOP = Runtime.alignMemory(STACK_MAX);

assert(DYNAMIC_BASE < TOTAL_MEMORY, "TOTAL_MEMORY not big enough for stack");



function nullFunc_iiii(x) { Module["printErr"]("Invalid function pointer called with signature 'iiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vi(x) { Module["printErr"]("Invalid function pointer called with signature 'vi'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_vii(x) { Module["printErr"]("Invalid function pointer called with signature 'vii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_ii(x) { Module["printErr"]("Invalid function pointer called with signature 'ii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viii(x) { Module["printErr"]("Invalid function pointer called with signature 'viii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function nullFunc_viiiiiii(x) { Module["printErr"]("Invalid function pointer called with signature 'viiiiiii'. Perhaps this is an invalid value (e.g. caused by calling a virtual method on a NULL pointer)? Or calling a function with an incorrect type, which will fail? (it is worth building your source files with -Werror (warnings are errors), as warnings can indicate undefined behavior which can cause this)");  Module["printErr"]("Build with ASSERTIONS=2 for more info.");abort(x) }

function invoke_iiii(index,a1,a2,a3) {
  try {
    return Module["dynCall_iiii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vi(index,a1) {
  try {
    Module["dynCall_vi"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_vii(index,a1,a2) {
  try {
    Module["dynCall_vii"](index,a1,a2);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_ii(index,a1) {
  try {
    return Module["dynCall_ii"](index,a1);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viii(index,a1,a2,a3) {
  try {
    Module["dynCall_viii"](index,a1,a2,a3);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

function invoke_viiiiiii(index,a1,a2,a3,a4,a5,a6,a7) {
  try {
    Module["dynCall_viiiiiii"](index,a1,a2,a3,a4,a5,a6,a7);
  } catch(e) {
    if (typeof e !== 'number' && e !== 'longjmp') throw e;
    asm["setThrew"](1, 0);
  }
}

Module.asmGlobalArg = { "Math": Math, "Int8Array": Int8Array, "Int16Array": Int16Array, "Int32Array": Int32Array, "Uint8Array": Uint8Array, "Uint16Array": Uint16Array, "Uint32Array": Uint32Array, "Float32Array": Float32Array, "Float64Array": Float64Array, "NaN": NaN, "Infinity": Infinity };

Module.asmLibraryArg = { "abort": abort, "assert": assert, "nullFunc_iiii": nullFunc_iiii, "nullFunc_vi": nullFunc_vi, "nullFunc_vii": nullFunc_vii, "nullFunc_ii": nullFunc_ii, "nullFunc_viii": nullFunc_viii, "nullFunc_viiiiiii": nullFunc_viiiiiii, "invoke_iiii": invoke_iiii, "invoke_vi": invoke_vi, "invoke_vii": invoke_vii, "invoke_ii": invoke_ii, "invoke_viii": invoke_viii, "invoke_viiiiiii": invoke_viiiiiii, "_pthread_cleanup_pop": _pthread_cleanup_pop, "___lock": ___lock, "___cxa_atexit": ___cxa_atexit, "_pthread_self": _pthread_self, "_atexit": _atexit, "___syscall6": ___syscall6, "_pthread_cleanup_push": _pthread_cleanup_push, "_abort": _abort, "_sbrk": _sbrk, "_time": _time, "___setErrNo": ___setErrNo, "_emscripten_memcpy_big": _emscripten_memcpy_big, "___syscall54": ___syscall54, "___unlock": ___unlock, "___syscall140": ___syscall140, "_sysconf": _sysconf, "___syscall146": ___syscall146, "STACKTOP": STACKTOP, "STACK_MAX": STACK_MAX, "tempDoublePtr": tempDoublePtr, "ABORT": ABORT, "___dso_handle": ___dso_handle };
// EMSCRIPTEN_START_ASM
var asm = (function(global, env, buffer) {
  'almost asm';
  
  
  var HEAP8 = new global.Int8Array(buffer);
  var HEAP16 = new global.Int16Array(buffer);
  var HEAP32 = new global.Int32Array(buffer);
  var HEAPU8 = new global.Uint8Array(buffer);
  var HEAPU16 = new global.Uint16Array(buffer);
  var HEAPU32 = new global.Uint32Array(buffer);
  var HEAPF32 = new global.Float32Array(buffer);
  var HEAPF64 = new global.Float64Array(buffer);


  var STACKTOP=env.STACKTOP|0;
  var STACK_MAX=env.STACK_MAX|0;
  var tempDoublePtr=env.tempDoublePtr|0;
  var ABORT=env.ABORT|0;
  var ___dso_handle=env.___dso_handle|0;

  var __THREW__ = 0;
  var threwValue = 0;
  var setjmpId = 0;
  var undef = 0;
  var nan = global.NaN, inf = global.Infinity;
  var tempInt = 0, tempBigInt = 0, tempBigIntP = 0, tempBigIntS = 0, tempBigIntR = 0.0, tempBigIntI = 0, tempBigIntD = 0, tempValue = 0, tempDouble = 0.0;

  var tempRet0 = 0;
  var tempRet1 = 0;
  var tempRet2 = 0;
  var tempRet3 = 0;
  var tempRet4 = 0;
  var tempRet5 = 0;
  var tempRet6 = 0;
  var tempRet7 = 0;
  var tempRet8 = 0;
  var tempRet9 = 0;
  var Math_floor=global.Math.floor;
  var Math_abs=global.Math.abs;
  var Math_sqrt=global.Math.sqrt;
  var Math_pow=global.Math.pow;
  var Math_cos=global.Math.cos;
  var Math_sin=global.Math.sin;
  var Math_tan=global.Math.tan;
  var Math_acos=global.Math.acos;
  var Math_asin=global.Math.asin;
  var Math_atan=global.Math.atan;
  var Math_atan2=global.Math.atan2;
  var Math_exp=global.Math.exp;
  var Math_log=global.Math.log;
  var Math_ceil=global.Math.ceil;
  var Math_imul=global.Math.imul;
  var Math_min=global.Math.min;
  var Math_clz32=global.Math.clz32;
  var abort=env.abort;
  var assert=env.assert;
  var nullFunc_iiii=env.nullFunc_iiii;
  var nullFunc_vi=env.nullFunc_vi;
  var nullFunc_vii=env.nullFunc_vii;
  var nullFunc_ii=env.nullFunc_ii;
  var nullFunc_viii=env.nullFunc_viii;
  var nullFunc_viiiiiii=env.nullFunc_viiiiiii;
  var invoke_iiii=env.invoke_iiii;
  var invoke_vi=env.invoke_vi;
  var invoke_vii=env.invoke_vii;
  var invoke_ii=env.invoke_ii;
  var invoke_viii=env.invoke_viii;
  var invoke_viiiiiii=env.invoke_viiiiiii;
  var _pthread_cleanup_pop=env._pthread_cleanup_pop;
  var ___lock=env.___lock;
  var ___cxa_atexit=env.___cxa_atexit;
  var _pthread_self=env._pthread_self;
  var _atexit=env._atexit;
  var ___syscall6=env.___syscall6;
  var _pthread_cleanup_push=env._pthread_cleanup_push;
  var _abort=env._abort;
  var _sbrk=env._sbrk;
  var _time=env._time;
  var ___setErrNo=env.___setErrNo;
  var _emscripten_memcpy_big=env._emscripten_memcpy_big;
  var ___syscall54=env.___syscall54;
  var ___unlock=env.___unlock;
  var ___syscall140=env.___syscall140;
  var _sysconf=env._sysconf;
  var ___syscall146=env.___syscall146;
  var tempFloat = 0.0;

// EMSCRIPTEN_START_FUNCS

function stackAlloc(size) {
  size = size|0;
  var ret = 0;
  ret = STACKTOP;
  STACKTOP = (STACKTOP + size)|0;
  STACKTOP = (STACKTOP + 15)&-16;
if ((STACKTOP|0) >= (STACK_MAX|0)) abort();

  return ret|0;
}
function stackSave() {
  return STACKTOP|0;
}
function stackRestore(top) {
  top = top|0;
  STACKTOP = top;
}
function establishStackSpace(stackBase, stackMax) {
  stackBase = stackBase|0;
  stackMax = stackMax|0;
  STACKTOP = stackBase;
  STACK_MAX = stackMax;
}

function setThrew(threw, value) {
  threw = threw|0;
  value = value|0;
  if ((__THREW__|0) == 0) {
    __THREW__ = threw;
    threwValue = value;
  }
}
function copyTempFloat(ptr) {
  ptr = ptr|0;
  HEAP8[tempDoublePtr>>0] = HEAP8[ptr>>0];
  HEAP8[tempDoublePtr+1>>0] = HEAP8[ptr+1>>0];
  HEAP8[tempDoublePtr+2>>0] = HEAP8[ptr+2>>0];
  HEAP8[tempDoublePtr+3>>0] = HEAP8[ptr+3>>0];
}
function copyTempDouble(ptr) {
  ptr = ptr|0;
  HEAP8[tempDoublePtr>>0] = HEAP8[ptr>>0];
  HEAP8[tempDoublePtr+1>>0] = HEAP8[ptr+1>>0];
  HEAP8[tempDoublePtr+2>>0] = HEAP8[ptr+2>>0];
  HEAP8[tempDoublePtr+3>>0] = HEAP8[ptr+3>>0];
  HEAP8[tempDoublePtr+4>>0] = HEAP8[ptr+4>>0];
  HEAP8[tempDoublePtr+5>>0] = HEAP8[ptr+5>>0];
  HEAP8[tempDoublePtr+6>>0] = HEAP8[ptr+6>>0];
  HEAP8[tempDoublePtr+7>>0] = HEAP8[ptr+7>>0];
}

function setTempRet0(value) {
  value = value|0;
  tempRet0 = value;
}
function getTempRet0() {
  return tempRet0|0;
}

function __ZN4ListI12PropertyInfo16DefaultAllocatorE5_Data5eraseEPKNS2_7ElementE($this,$p_I) {
 $this = $this|0;
 $p_I = $p_I|0;
 var $$0 = 0, $$pre = 0, $$pre2 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($p_I|0)==(0|0);
 if ($0) {
  __Z16_err_print_errorPKcS0_iS0_16ErrorHandlerType(168,174,158,124,0);
  $$0 = 0;
  return ($$0|0);
 }
 HEAP8[18385] = 0;
 $1 = ((($p_I)) + 28|0);
 $2 = HEAP32[$1>>2]|0;
 $3 = ($2|0)==($this|0);
 if (!($3)) {
  __Z16_err_print_errorPKcS0_iS0_16ErrorHandlerType(168,174,159,186,0);
  $$0 = 0;
  return ($$0|0);
 }
 HEAP8[18385] = 0;
 $4 = HEAP32[$this>>2]|0;
 $5 = ($4|0)==($p_I|0);
 if ($5) {
  $6 = ((($p_I)) + 20|0);
  $7 = HEAP32[$6>>2]|0;
  HEAP32[$this>>2] = $7;
 }
 $8 = ((($this)) + 4|0);
 $9 = HEAP32[$8>>2]|0;
 $10 = ($9|0)==($p_I|0);
 $11 = ((($p_I)) + 24|0);
 if ($10) {
  $13 = HEAP32[$11>>2]|0;
  HEAP32[$8>>2] = $13;
  $14 = $13;
  $15 = $14;$22 = $13;
 } else {
  $$pre = HEAP32[$11>>2]|0;
  $12 = $$pre;
  $15 = $$pre;$22 = $12;
 }
 $16 = ($15|0)==(0|0);
 $$pre2 = ((($p_I)) + 20|0);
 if (!($16)) {
  $17 = HEAP32[$$pre2>>2]|0;
  $18 = ((($15)) + 20|0);
  HEAP32[$18>>2] = $17;
 }
 $19 = HEAP32[$$pre2>>2]|0;
 $20 = ($19|0)==(0|0);
 if (!($20)) {
  $21 = ((($19)) + 24|0);
  HEAP32[$21>>2] = $22;
 }
 $23 = ((($p_I)) + 12|0);
 $24 = HEAP32[$23>>2]|0;
 $25 = ($24|0)==(0|0);
 if (!($25)) {
  $26 = ((($24)) + -8|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = ($27|0)>(0);
  if ($28) {
   $29 = (($27) + -1)|0;
   HEAP32[$26>>2] = $29;
   $30 = $29;
  } else {
   $30 = $27;
  }
  $31 = ($30|0)==(0);
  if ($31) {
   __ZN6Memory11free_staticEPv($26);
  }
 }
 $32 = ((($p_I)) + 4|0);
 $33 = HEAP32[$32>>2]|0;
 $34 = ($33|0)==(0|0);
 if (!($34)) {
  $35 = ((($33)) + -8|0);
  $36 = HEAP32[$35>>2]|0;
  $37 = ($36|0)>(0);
  if ($37) {
   $38 = (($36) + -1)|0;
   HEAP32[$35>>2] = $38;
   $39 = $38;
  } else {
   $39 = $36;
  }
  $40 = ($39|0)==(0);
  if ($40) {
   __ZN6Memory11free_staticEPv($35);
  }
 }
 __ZN6Memory11free_staticEPv($p_I);
 $41 = ((($this)) + 8|0);
 $42 = HEAP32[$41>>2]|0;
 $43 = (($42) + -1)|0;
 HEAP32[$41>>2] = $43;
 $$0 = 1;
 return ($$0|0);
}
function __GLOBAL__sub_I_object_type_db_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[124] = 0;
 HEAP32[(504)>>2] = 0;
 HEAP8[(500)>>0] = 0;
 (___cxa_atexit((4|0),(496|0),(___dso_handle|0))|0);
 HEAP32[127] = 0;
 HEAP32[(516)>>2] = 0;
 HEAP8[(512)>>0] = 0;
 (___cxa_atexit((5|0),(508|0),(___dso_handle|0))|0);
 HEAP32[130] = 0;
 HEAP32[(528)>>2] = 0;
 HEAP8[(524)>>0] = 0;
 (___cxa_atexit((5|0),(520|0),(___dso_handle|0))|0);
 return;
}
function __ZN7HashMapI10StringNameN12ObjectTypeDB8TypeInfoE16StringNameHasherLh3ELh8EED2Ev($this) {
 $this = $this|0;
 var $$lcssa = 0, $$pre$i = 0, $$pre5$i = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$02$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 $$pre5$i = ((($this)) + 4|0);
 if ($1) {
  HEAP32[$this>>2] = 0;
  HEAP8[$$pre5$i>>0] = 0;
  $25 = ((($this)) + 8|0);
  HEAP32[$25>>2] = 0;
  return;
 }
 $2 = HEAP8[$$pre5$i>>0]|0;
 $3 = ($2<<24>>24)==(31);
 if ($3) {
  $9 = $0;
 } else {
  $26 = $2;$5 = $0;$i$02$i = 0;
  while(1) {
   $4 = (($5) + ($i$02$i<<2)|0);
   $6 = HEAP32[$4>>2]|0;
   $7 = ($6|0)==(0|0);
   if ($7) {
    $22 = $26;$27 = $5;
   } else {
    $11 = $6;$13 = $4;
    while(1) {
     $10 = ((($11)) + 4|0);
     $12 = HEAP32[$10>>2]|0;
     HEAP32[$13>>2] = $12;
     $14 = ((($11)) + 12|0);
     __ZN12ObjectTypeDB8TypeInfoD2Ev($14);
     $15 = ((($11)) + 8|0);
     __ZN10StringNameD2Ev($15);
     __ZN6Memory11free_staticEPv($11);
     $16 = HEAP32[$this>>2]|0;
     $17 = (($16) + ($i$02$i<<2)|0);
     $18 = HEAP32[$17>>2]|0;
     $19 = ($18|0)==(0|0);
     if ($19) {
      $$lcssa = $16;
      break;
     } else {
      $11 = $18;$13 = $17;
     }
    }
    $$pre$i = HEAP8[$$pre5$i>>0]|0;
    $22 = $$pre$i;$27 = $$lcssa;
   }
   $20 = (($i$02$i) + 1)|0;
   $21 = $22&255;
   $23 = 1 << $21;
   $24 = ($20|0)<($23|0);
   if ($24) {
    $26 = $22;$5 = $27;$i$02$i = $20;
   } else {
    $9 = $27;
    break;
   }
  }
 }
 $8 = ((($9)) + -4|0);
 __ZN6Memory11free_staticEPv($8);
 HEAP32[$this>>2] = 0;
 HEAP8[$$pre5$i>>0] = 0;
 $25 = ((($this)) + 8|0);
 HEAP32[$25>>2] = 0;
 return;
}
function __ZN12ObjectTypeDB8TypeInfoD2Ev($this) {
 $this = $this|0;
 var $$in$i = 0, $$in$i$lcssa = 0, $$lcssa = 0, $$lcssa69 = 0, $$lcssa71 = 0, $$lcssa75 = 0, $$pre$i$i = 0, $$pre$i$i16 = 0, $$pre$i$i7 = 0, $$pre5$i$i = 0, $$pre5$i$i1 = 0, $$pre5$i$i10 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0;
 var $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0;
 var $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0;
 var $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0;
 var $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0;
 var $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $i$02$i$i = 0, $i$02$i$i12 = 0, $i$02$i$i3 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($this)) + 76|0);
 __ZN10StringNameD2Ev($0);
 $1 = ((($this)) + 72|0);
 __ZN10StringNameD2Ev($1);
 $2 = ((($this)) + 60|0);
 __ZN7HashMapI10StringNameN12ObjectTypeDB14PropertySetGetE16StringNameHasherLh3ELh8EE5clearEv($2);
 $3 = ((($this)) + 56|0);
 __ZN10StringNameD2Ev($3);
 $4 = ((($this)) + 52|0);
 __ZN4ListI10MethodInfo16DefaultAllocatorED2Ev($4);
 $5 = ((($this)) + 48|0);
 __ZN4ListI10StringName16DefaultAllocatorED2Ev($5);
 $6 = ((($this)) + 44|0);
 __ZN4ListI10StringName16DefaultAllocatorED2Ev($6);
 $7 = ((($this)) + 40|0);
 $8 = HEAP32[$7>>2]|0;
 $9 = ($8|0)==(0|0);
 L1: do {
  if (!($9)) {
   $$in$i = $8;
   while(1) {
    $10 = HEAP32[$$in$i>>2]|0;
    $11 = ($10|0)==(0|0);
    if ($11) {
     $$in$i$lcssa = $$in$i;
     break;
    }
    (__ZN4ListI12PropertyInfo16DefaultAllocatorE5_Data5eraseEPKNS2_7ElementE($$in$i,$10)|0);
    $12 = HEAP32[$7>>2]|0;
    $14 = ((($12)) + 8|0);
    $15 = HEAP32[$14>>2]|0;
    $16 = ($15|0)==(0);
    if ($16) {
     $$lcssa75 = $12;
     label = 5;
     break;
    }
    $13 = ($12|0)==(0|0);
    if ($13) {
     break L1;
    } else {
     $$in$i = $12;
    }
   }
   if ((label|0) == 5) {
    __ZN6Memory11free_staticEPv($$lcssa75);
    HEAP32[$7>>2] = 0;
    break;
   }
   $17 = ((($$in$i$lcssa)) + 8|0);
   $18 = HEAP32[$17>>2]|0;
   $19 = ($18|0)==(0);
   if ($19) {
    HEAP8[18385] = 0;
    __ZN6Memory11free_staticEPv($$in$i$lcssa);
    break;
   } else {
    __Z16_err_print_errorPKcS0_iS0_16ErrorHandlerType(241,174,686,247,0);
    break;
   }
  }
 } while(0);
 $20 = ((($this)) + 28|0);
 $21 = HEAP32[$20>>2]|0;
 $22 = ($21|0)==(0|0);
 $$pre5$i$i = ((($this)) + 32|0);
 if (!($22)) {
  $23 = HEAP8[$$pre5$i$i>>0]|0;
  $24 = ($23<<24>>24)==(31);
  if ($24) {
   $30 = $21;
  } else {
   $26 = $21;$99 = $23;$i$02$i$i = 0;
   while(1) {
    $25 = (($26) + ($i$02$i$i<<2)|0);
    $27 = HEAP32[$25>>2]|0;
    $28 = ($27|0)==(0|0);
    if ($28) {
     $100 = $26;$43 = $99;
    } else {
     $32 = $27;$34 = $25;
     while(1) {
      $31 = ((($32)) + 4|0);
      $33 = HEAP32[$31>>2]|0;
      HEAP32[$34>>2] = $33;
      $35 = ((($32)) + 12|0);
      __ZN10MethodInfoD2Ev($35);
      $36 = ((($32)) + 8|0);
      __ZN10StringNameD2Ev($36);
      __ZN6Memory11free_staticEPv($32);
      $37 = HEAP32[$20>>2]|0;
      $38 = (($37) + ($i$02$i$i<<2)|0);
      $39 = HEAP32[$38>>2]|0;
      $40 = ($39|0)==(0|0);
      if ($40) {
       $$lcssa71 = $37;
       break;
      } else {
       $32 = $39;$34 = $38;
      }
     }
     $$pre$i$i = HEAP8[$$pre5$i$i>>0]|0;
     $100 = $$lcssa71;$43 = $$pre$i$i;
    }
    $41 = (($i$02$i$i) + 1)|0;
    $42 = $43&255;
    $44 = 1 << $42;
    $45 = ($41|0)<($44|0);
    if ($45) {
     $26 = $100;$99 = $43;$i$02$i$i = $41;
    } else {
     $30 = $100;
     break;
    }
   }
  }
  $29 = ((($30)) + -4|0);
  __ZN6Memory11free_staticEPv($29);
 }
 HEAP32[$20>>2] = 0;
 HEAP8[$$pre5$i$i>>0] = 0;
 $46 = ((($this)) + 36|0);
 HEAP32[$46>>2] = 0;
 $47 = ((($this)) + 16|0);
 $48 = HEAP32[$47>>2]|0;
 $49 = ($48|0)==(0|0);
 $$pre5$i$i1 = ((($this)) + 20|0);
 if (!($49)) {
  $50 = HEAP8[$$pre5$i$i1>>0]|0;
  $51 = ($50<<24>>24)==(31);
  if ($51) {
   $57 = $48;
  } else {
   $101 = $50;$53 = $48;$i$02$i$i3 = 0;
   while(1) {
    $52 = (($53) + ($i$02$i$i3<<2)|0);
    $54 = HEAP32[$52>>2]|0;
    $55 = ($54|0)==(0|0);
    if ($55) {
     $102 = $53;$69 = $101;
    } else {
     $59 = $54;$61 = $52;
     while(1) {
      $58 = ((($59)) + 4|0);
      $60 = HEAP32[$58>>2]|0;
      HEAP32[$61>>2] = $60;
      $62 = ((($59)) + 8|0);
      __ZN10StringNameD2Ev($62);
      __ZN6Memory11free_staticEPv($59);
      $63 = HEAP32[$47>>2]|0;
      $64 = (($63) + ($i$02$i$i3<<2)|0);
      $65 = HEAP32[$64>>2]|0;
      $66 = ($65|0)==(0|0);
      if ($66) {
       $$lcssa69 = $63;
       break;
      } else {
       $59 = $65;$61 = $64;
      }
     }
     $$pre$i$i7 = HEAP8[$$pre5$i$i1>>0]|0;
     $102 = $$lcssa69;$69 = $$pre$i$i7;
    }
    $67 = (($i$02$i$i3) + 1)|0;
    $68 = $69&255;
    $70 = 1 << $68;
    $71 = ($67|0)<($70|0);
    if ($71) {
     $101 = $69;$53 = $102;$i$02$i$i3 = $67;
    } else {
     $57 = $102;
     break;
    }
   }
  }
  $56 = ((($57)) + -4|0);
  __ZN6Memory11free_staticEPv($56);
 }
 HEAP32[$47>>2] = 0;
 HEAP8[$$pre5$i$i1>>0] = 0;
 $72 = ((($this)) + 24|0);
 HEAP32[$72>>2] = 0;
 $73 = ((($this)) + 4|0);
 $74 = HEAP32[$73>>2]|0;
 $75 = ($74|0)==(0|0);
 $$pre5$i$i10 = ((($this)) + 8|0);
 if ($75) {
  HEAP32[$73>>2] = 0;
  HEAP8[$$pre5$i$i10>>0] = 0;
  $98 = ((($this)) + 12|0);
  HEAP32[$98>>2] = 0;
  return;
 }
 $76 = HEAP8[$$pre5$i$i10>>0]|0;
 $77 = ($76<<24>>24)==(31);
 if ($77) {
  $83 = $74;
 } else {
  $103 = $76;$79 = $74;$i$02$i$i12 = 0;
  while(1) {
   $78 = (($79) + ($i$02$i$i12<<2)|0);
   $80 = HEAP32[$78>>2]|0;
   $81 = ($80|0)==(0|0);
   if ($81) {
    $104 = $79;$95 = $103;
   } else {
    $85 = $80;$87 = $78;
    while(1) {
     $84 = ((($85)) + 4|0);
     $86 = HEAP32[$84>>2]|0;
     HEAP32[$87>>2] = $86;
     $88 = ((($85)) + 8|0);
     __ZN10StringNameD2Ev($88);
     __ZN6Memory11free_staticEPv($85);
     $89 = HEAP32[$73>>2]|0;
     $90 = (($89) + ($i$02$i$i12<<2)|0);
     $91 = HEAP32[$90>>2]|0;
     $92 = ($91|0)==(0|0);
     if ($92) {
      $$lcssa = $89;
      break;
     } else {
      $85 = $91;$87 = $90;
     }
    }
    $$pre$i$i16 = HEAP8[$$pre5$i$i10>>0]|0;
    $104 = $$lcssa;$95 = $$pre$i$i16;
   }
   $93 = (($i$02$i$i12) + 1)|0;
   $94 = $95&255;
   $96 = 1 << $94;
   $97 = ($93|0)<($96|0);
   if ($97) {
    $103 = $95;$79 = $104;$i$02$i$i12 = $93;
   } else {
    $83 = $104;
    break;
   }
  }
 }
 $82 = ((($83)) + -4|0);
 __ZN6Memory11free_staticEPv($82);
 HEAP32[$73>>2] = 0;
 HEAP8[$$pre5$i$i10>>0] = 0;
 $98 = ((($this)) + 12|0);
 HEAP32[$98>>2] = 0;
 return;
}
function __ZN7HashMapI10StringNameN12ObjectTypeDB14PropertySetGetE16StringNameHasherLh3ELh8EE5clearEv($this) {
 $this = $this|0;
 var $$lcssa = 0, $$pre = 0, $$pre5 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$02 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 $$pre5 = ((($this)) + 4|0);
 if ($1) {
  HEAP32[$this>>2] = 0;
  HEAP8[$$pre5>>0] = 0;
  $26 = ((($this)) + 8|0);
  HEAP32[$26>>2] = 0;
  return;
 }
 $2 = HEAP8[$$pre5>>0]|0;
 $3 = ($2<<24>>24)==(31);
 if ($3) {
  $9 = $0;
 } else {
  $27 = $2;$5 = $0;$i$02 = 0;
  while(1) {
   $4 = (($5) + ($i$02<<2)|0);
   $6 = HEAP32[$4>>2]|0;
   $7 = ($6|0)==(0|0);
   if ($7) {
    $23 = $27;$28 = $5;
   } else {
    $11 = $6;$13 = $4;
    while(1) {
     $10 = ((($11)) + 4|0);
     $12 = HEAP32[$10>>2]|0;
     HEAP32[$13>>2] = $12;
     $14 = ((($11)) + 20|0);
     __ZN10StringNameD2Ev($14);
     $15 = ((($11)) + 16|0);
     __ZN10StringNameD2Ev($15);
     $16 = ((($11)) + 8|0);
     __ZN10StringNameD2Ev($16);
     __ZN6Memory11free_staticEPv($11);
     $17 = HEAP32[$this>>2]|0;
     $18 = (($17) + ($i$02<<2)|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ($19|0)==(0|0);
     if ($20) {
      $$lcssa = $17;
      break;
     } else {
      $11 = $19;$13 = $18;
     }
    }
    $$pre = HEAP8[$$pre5>>0]|0;
    $23 = $$pre;$28 = $$lcssa;
   }
   $21 = (($i$02) + 1)|0;
   $22 = $23&255;
   $24 = 1 << $22;
   $25 = ($21|0)<($24|0);
   if ($25) {
    $27 = $23;$5 = $28;$i$02 = $21;
   } else {
    $9 = $28;
    break;
   }
  }
 }
 $8 = ((($9)) + -4|0);
 __ZN6Memory11free_staticEPv($8);
 HEAP32[$this>>2] = 0;
 HEAP8[$$pre5>>0] = 0;
 $26 = ((($this)) + 8|0);
 HEAP32[$26>>2] = 0;
 return;
}
function __ZN4ListI10MethodInfo16DefaultAllocatorED2Ev($this) {
 $this = $this|0;
 var $$in = 0, $$in$lcssa27 = 0, $$lcssa25 = 0, $$pre$i = 0, $$pre2$i = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 } else {
  $$in = $0;
 }
 while(1) {
  $2 = HEAP32[$$in>>2]|0;
  $3 = ($2|0)==(0|0);
  if ($3) {
   $$in$lcssa27 = $$in;
   label = 16;
   break;
  }
  HEAP8[18385] = 0;
  $6 = ((($2)) + 48|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = ($7|0)==($$in|0);
  if ($8) {
   HEAP8[18385] = 0;
   $9 = ((($2)) + 40|0);
   $10 = HEAP32[$9>>2]|0;
   HEAP32[$$in>>2] = $10;
   $11 = ((($$in)) + 4|0);
   $12 = HEAP32[$11>>2]|0;
   $13 = ($12|0)==($2|0);
   $14 = ((($2)) + 44|0);
   if ($13) {
    $16 = HEAP32[$14>>2]|0;
    HEAP32[$11>>2] = $16;
    $17 = $16;
    $18 = $17;$25 = $16;
   } else {
    $$pre$i = HEAP32[$14>>2]|0;
    $15 = $$pre$i;
    $18 = $$pre$i;$25 = $15;
   }
   $19 = ($18|0)==(0|0);
   $$pre2$i = ((($2)) + 40|0);
   if (!($19)) {
    $20 = HEAP32[$$pre2$i>>2]|0;
    $21 = ((($18)) + 40|0);
    HEAP32[$21>>2] = $20;
   }
   $22 = HEAP32[$$pre2$i>>2]|0;
   $23 = ($22|0)==(0|0);
   if (!($23)) {
    $24 = ((($22)) + 44|0);
    HEAP32[$24>>2] = $25;
   }
   __ZN10MethodInfoD2Ev($2);
   __ZN6Memory11free_staticEPv($2);
   $26 = ((($$in)) + 8|0);
   $27 = HEAP32[$26>>2]|0;
   $28 = (($27) + -1)|0;
   HEAP32[$26>>2] = $28;
  } else {
   __Z16_err_print_errorPKcS0_iS0_16ErrorHandlerType(168,174,159,186,0);
  }
  $4 = HEAP32[$this>>2]|0;
  $29 = ((($4)) + 8|0);
  $30 = HEAP32[$29>>2]|0;
  $31 = ($30|0)==(0);
  if ($31) {
   $$lcssa25 = $4;
   label = 15;
   break;
  }
  $5 = ($4|0)==(0|0);
  if ($5) {
   label = 19;
   break;
  } else {
   $$in = $4;
  }
 }
 if ((label|0) == 15) {
  __ZN6Memory11free_staticEPv($$lcssa25);
  HEAP32[$this>>2] = 0;
  return;
 }
 else if ((label|0) == 16) {
  $32 = ((($$in$lcssa27)) + 8|0);
  $33 = HEAP32[$32>>2]|0;
  $34 = ($33|0)==(0);
  if ($34) {
   HEAP8[18385] = 0;
   __ZN6Memory11free_staticEPv($$in$lcssa27);
   return;
  } else {
   __Z16_err_print_errorPKcS0_iS0_16ErrorHandlerType(241,174,686,247,0);
   return;
  }
 }
 else if ((label|0) == 19) {
  return;
 }
}
function __ZN10MethodInfoD2Ev($this) {
 $this = $this|0;
 var $$in$i = 0, $$in$i$lcssa = 0, $$lcssa = 0, $$pre$i$i = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $6 = 0, $7 = 0;
 var $8 = 0, $9 = 0, $i$01$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($this)) + 24|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = ((($1)) + -8|0);
  $4 = HEAP32[$3>>2]|0;
  $5 = ($4|0)>(0);
  if ($5) {
   $6 = (($4) + -1)|0;
   HEAP32[$3>>2] = $6;
   $7 = $6;
  } else {
   $7 = $4;
  }
  $8 = ($7|0)==(0);
  if ($8) {
   __ZN6Memory11free_staticEPv($3);
  }
 }
 $9 = ((($this)) + 16|0);
 $10 = HEAP32[$9>>2]|0;
 $11 = ($10|0)==(0|0);
 if (!($11)) {
  $12 = ((($10)) + -8|0);
  $13 = HEAP32[$12>>2]|0;
  $14 = ($13|0)>(0);
  if ($14) {
   $15 = (($13) + -1)|0;
   HEAP32[$12>>2] = $15;
   $16 = $15;
  } else {
   $16 = $13;
  }
  $17 = ($16|0)==(0);
  if ($17) {
   __ZN6Memory11free_staticEPv($12);
  }
 }
 $18 = ((($this)) + 8|0);
 $19 = HEAP32[$18>>2]|0;
 $20 = ($19|0)==(0|0);
 if (!($20)) {
  $21 = ((($19)) + -8|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = ($22|0)>(0);
  if ($23) {
   $24 = (($22) + -1)|0;
   HEAP32[$21>>2] = $24;
   $25 = $24;
  } else {
   $25 = $22;
  }
  $26 = ($25|0)==(0);
  if ($26) {
   $27 = ((($19)) + -4|0);
   $28 = HEAP32[$27>>2]|0;
   $29 = ($28|0)>(0);
   if ($29) {
    $57 = $28;$i$01$i$i = 0;
    while(1) {
     $30 = (($19) + (($i$01$i$i*24)|0)|0);
     $31 = HEAP32[$30>>2]|0;
     $32 = ($31|0)==(0);
     if ($32) {
      $35 = $57;
     } else {
      __ZN7Variant5clearEv($30);
      $$pre$i$i = HEAP32[$27>>2]|0;
      $35 = $$pre$i$i;
     }
     $33 = (($i$01$i$i) + 1)|0;
     $34 = ($33|0)<($35|0);
     if ($34) {
      $57 = $35;$i$01$i$i = $33;
     } else {
      break;
     }
    }
   }
   __ZN6Memory11free_staticEPv($21);
  }
 }
 $36 = ((($this)) + 4|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = ($37|0)==(0|0);
 L29: do {
  if (!($38)) {
   $$in$i = $37;
   while(1) {
    $39 = HEAP32[$$in$i>>2]|0;
    $40 = ($39|0)==(0|0);
    if ($40) {
     $$in$i$lcssa = $$in$i;
     break;
    }
    (__ZN4ListI12PropertyInfo16DefaultAllocatorE5_Data5eraseEPKNS2_7ElementE($$in$i,$39)|0);
    $41 = HEAP32[$36>>2]|0;
    $43 = ((($41)) + 8|0);
    $44 = HEAP32[$43>>2]|0;
    $45 = ($44|0)==(0);
    if ($45) {
     $$lcssa = $41;
     label = 24;
     break;
    }
    $42 = ($41|0)==(0|0);
    if ($42) {
     break L29;
    } else {
     $$in$i = $41;
    }
   }
   if ((label|0) == 24) {
    __ZN6Memory11free_staticEPv($$lcssa);
    HEAP32[$36>>2] = 0;
    break;
   }
   $46 = ((($$in$i$lcssa)) + 8|0);
   $47 = HEAP32[$46>>2]|0;
   $48 = ($47|0)==(0);
   if ($48) {
    HEAP8[18385] = 0;
    __ZN6Memory11free_staticEPv($$in$i$lcssa);
    break;
   } else {
    __Z16_err_print_errorPKcS0_iS0_16ErrorHandlerType(241,174,686,247,0);
    break;
   }
  }
 } while(0);
 $49 = HEAP32[$this>>2]|0;
 $50 = ($49|0)==(0|0);
 if ($50) {
  return;
 }
 $51 = ((($49)) + -8|0);
 $52 = HEAP32[$51>>2]|0;
 $53 = ($52|0)>(0);
 if ($53) {
  $54 = (($52) + -1)|0;
  HEAP32[$51>>2] = $54;
  $55 = $54;
 } else {
  $55 = $52;
 }
 $56 = ($55|0)==(0);
 if (!($56)) {
  return;
 }
 __ZN6Memory11free_staticEPv($51);
 return;
}
function __ZN4ListI10StringName16DefaultAllocatorED2Ev($this) {
 $this = $this|0;
 var $$in = 0, $$in$lcssa27 = 0, $$lcssa25 = 0, $$pre$i = 0, $$pre2$i = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0;
 var $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 } else {
  $$in = $0;
 }
 while(1) {
  $2 = HEAP32[$$in>>2]|0;
  $3 = ($2|0)==(0|0);
  if ($3) {
   $$in$lcssa27 = $$in;
   label = 16;
   break;
  }
  HEAP8[18385] = 0;
  $6 = ((($2)) + 12|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = ($7|0)==($$in|0);
  if ($8) {
   HEAP8[18385] = 0;
   $9 = ((($2)) + 4|0);
   $10 = HEAP32[$9>>2]|0;
   HEAP32[$$in>>2] = $10;
   $11 = ((($$in)) + 4|0);
   $12 = HEAP32[$11>>2]|0;
   $13 = ($12|0)==($2|0);
   $14 = ((($2)) + 8|0);
   if ($13) {
    $16 = HEAP32[$14>>2]|0;
    HEAP32[$11>>2] = $16;
    $17 = $16;
    $18 = $17;$25 = $16;
   } else {
    $$pre$i = HEAP32[$14>>2]|0;
    $15 = $$pre$i;
    $18 = $$pre$i;$25 = $15;
   }
   $19 = ($18|0)==(0|0);
   $$pre2$i = ((($2)) + 4|0);
   if (!($19)) {
    $20 = HEAP32[$$pre2$i>>2]|0;
    $21 = ((($18)) + 4|0);
    HEAP32[$21>>2] = $20;
   }
   $22 = HEAP32[$$pre2$i>>2]|0;
   $23 = ($22|0)==(0|0);
   if (!($23)) {
    $24 = ((($22)) + 8|0);
    HEAP32[$24>>2] = $25;
   }
   __ZN10StringNameD2Ev($2);
   __ZN6Memory11free_staticEPv($2);
   $26 = ((($$in)) + 8|0);
   $27 = HEAP32[$26>>2]|0;
   $28 = (($27) + -1)|0;
   HEAP32[$26>>2] = $28;
  } else {
   __Z16_err_print_errorPKcS0_iS0_16ErrorHandlerType(168,174,159,186,0);
  }
  $4 = HEAP32[$this>>2]|0;
  $29 = ((($4)) + 8|0);
  $30 = HEAP32[$29>>2]|0;
  $31 = ($30|0)==(0);
  if ($31) {
   $$lcssa25 = $4;
   label = 15;
   break;
  }
  $5 = ($4|0)==(0|0);
  if ($5) {
   label = 19;
   break;
  } else {
   $$in = $4;
  }
 }
 if ((label|0) == 15) {
  __ZN6Memory11free_staticEPv($$lcssa25);
  HEAP32[$this>>2] = 0;
  return;
 }
 else if ((label|0) == 16) {
  $32 = ((($$in$lcssa27)) + 8|0);
  $33 = HEAP32[$32>>2]|0;
  $34 = ($33|0)==(0);
  if ($34) {
   HEAP8[18385] = 0;
   __ZN6Memory11free_staticEPv($$in$lcssa27);
   return;
  } else {
   __Z16_err_print_errorPKcS0_iS0_16ErrorHandlerType(241,174,686,247,0);
   return;
  }
 }
 else if ((label|0) == 19) {
  return;
 }
}
function __ZN7HashMapI10StringNameS0_16StringNameHasherLh3ELh8EED2Ev($this) {
 $this = $this|0;
 var $$lcssa = 0, $$pre$i = 0, $$pre5$i = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$02$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 $$pre5$i = ((($this)) + 4|0);
 if ($1) {
  HEAP32[$this>>2] = 0;
  HEAP8[$$pre5$i>>0] = 0;
  $25 = ((($this)) + 8|0);
  HEAP32[$25>>2] = 0;
  return;
 }
 $2 = HEAP8[$$pre5$i>>0]|0;
 $3 = ($2<<24>>24)==(31);
 if ($3) {
  $9 = $0;
 } else {
  $26 = $2;$5 = $0;$i$02$i = 0;
  while(1) {
   $4 = (($5) + ($i$02$i<<2)|0);
   $6 = HEAP32[$4>>2]|0;
   $7 = ($6|0)==(0|0);
   if ($7) {
    $22 = $26;$27 = $5;
   } else {
    $11 = $6;$13 = $4;
    while(1) {
     $10 = ((($11)) + 4|0);
     $12 = HEAP32[$10>>2]|0;
     HEAP32[$13>>2] = $12;
     $14 = ((($11)) + 12|0);
     __ZN10StringNameD2Ev($14);
     $15 = ((($11)) + 8|0);
     __ZN10StringNameD2Ev($15);
     __ZN6Memory11free_staticEPv($11);
     $16 = HEAP32[$this>>2]|0;
     $17 = (($16) + ($i$02$i<<2)|0);
     $18 = HEAP32[$17>>2]|0;
     $19 = ($18|0)==(0|0);
     if ($19) {
      $$lcssa = $16;
      break;
     } else {
      $11 = $18;$13 = $17;
     }
    }
    $$pre$i = HEAP8[$$pre5$i>>0]|0;
    $22 = $$pre$i;$27 = $$lcssa;
   }
   $20 = (($i$02$i) + 1)|0;
   $21 = $22&255;
   $23 = 1 << $21;
   $24 = ($20|0)<($23|0);
   if ($24) {
    $26 = $22;$5 = $27;$i$02$i = $20;
   } else {
    $9 = $27;
    break;
   }
  }
 }
 $8 = ((($9)) + -4|0);
 __ZN6Memory11free_staticEPv($8);
 HEAP32[$this>>2] = 0;
 HEAP8[$$pre5$i>>0] = 0;
 $25 = ((($this)) + 8|0);
 HEAP32[$25>>2] = 0;
 return;
}
function __ZN8NodePath4DataD2Ev($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$01$i$i = 0, $i$01$i$i3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($this)) + 12|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = ((($1)) + -8|0);
  $4 = HEAP32[$3>>2]|0;
  $5 = ($4|0)>(0);
  if ($5) {
   $6 = (($4) + -1)|0;
   HEAP32[$3>>2] = $6;
   $7 = $6;
  } else {
   $7 = $4;
  }
  $8 = ($7|0)==(0);
  if ($8) {
   $9 = ((($1)) + -4|0);
   $10 = HEAP32[$9>>2]|0;
   $11 = ($10|0)>(0);
   if ($11) {
    $i$01$i$i = 0;
    while(1) {
     $12 = (($1) + ($i$01$i$i<<2)|0);
     __ZN10StringNameD2Ev($12);
     $13 = (($i$01$i$i) + 1)|0;
     $14 = HEAP32[$9>>2]|0;
     $15 = ($13|0)<($14|0);
     if ($15) {
      $i$01$i$i = $13;
     } else {
      break;
     }
    }
   }
   __ZN6Memory11free_staticEPv($3);
  }
 }
 $16 = ((($this)) + 8|0);
 $17 = HEAP32[$16>>2]|0;
 $18 = ($17|0)==(0|0);
 if ($18) {
  $32 = ((($this)) + 4|0);
  __ZN10StringNameD2Ev($32);
  return;
 }
 $19 = ((($17)) + -8|0);
 $20 = HEAP32[$19>>2]|0;
 $21 = ($20|0)>(0);
 if ($21) {
  $22 = (($20) + -1)|0;
  HEAP32[$19>>2] = $22;
  $23 = $22;
 } else {
  $23 = $20;
 }
 $24 = ($23|0)==(0);
 if (!($24)) {
  $32 = ((($this)) + 4|0);
  __ZN10StringNameD2Ev($32);
  return;
 }
 $25 = ((($17)) + -4|0);
 $26 = HEAP32[$25>>2]|0;
 $27 = ($26|0)>(0);
 if ($27) {
  $i$01$i$i3 = 0;
  while(1) {
   $28 = (($17) + ($i$01$i$i3<<2)|0);
   __ZN10StringNameD2Ev($28);
   $29 = (($i$01$i$i3) + 1)|0;
   $30 = HEAP32[$25>>2]|0;
   $31 = ($29|0)<($30|0);
   if ($31) {
    $i$01$i$i3 = $29;
   } else {
    break;
   }
  }
 }
 __ZN6Memory11free_staticEPv($19);
 $32 = ((($this)) + 4|0);
 __ZN10StringNameD2Ev($32);
 return;
}
function __ZN8NodePathD2Ev($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 if (!($1)) {
  $2 = HEAP32[$0>>2]|0;
  $3 = ($2|0)>(0);
  if ($3) {
   $4 = (($2) + -1)|0;
   HEAP32[$0>>2] = $4;
   $5 = $4;
  } else {
   $5 = $2;
  }
  $6 = ($5|0)==(0);
  if ($6) {
   __ZN8NodePath4DataD2Ev($0);
   __ZN6Memory11free_staticEPv($0);
  }
 }
 HEAP32[$this>>2] = 0;
 return;
}
function __ZN7DVectorIhE11unreferenceEv($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, $lock = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $lock = sp + 4|0;
 $0 = sp;
 $1 = HEAP32[136]|0;
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = HEAP32[$1>>2]|0;
  $4 = HEAP32[$3>>2]|0;
  FUNCTION_TABLE_vi[$4 & 15]($1);
 }
 $5 = HEAP32[$this>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = HEAP32[136]|0;
  $8 = ($7|0)==(0|0);
  if ($8) {
   STACKTOP = sp;return;
  }
  $9 = HEAP32[$7>>2]|0;
  $10 = ((($9)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  FUNCTION_TABLE_vi[$11 & 15]($7);
  STACKTOP = sp;return;
 }
 HEAP32[$lock>>2] = 0;
 $12 = HEAP32[$5>>2]|0;
 $13 = (($12) + 1)|0;
 HEAP32[$5>>2] = $13;
 HEAP32[$lock>>2] = $5;
 $14 = ((($5)) + 8|0);
 $15 = $14;
 $16 = $15;
 $17 = HEAP32[$16>>2]|0;
 $18 = (($15) + 4)|0;
 $19 = $18;
 $20 = HEAP32[$19>>2]|0;
 $21 = ($17|0)==(-1);
 $22 = ($20|0)==(0);
 $23 = $21 & $22;
 if (!($23)) {
  $24 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = ((($25)) + 24|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = $14;
  $29 = $28;
  $30 = HEAP32[$29>>2]|0;
  $31 = (($28) + 4)|0;
  $32 = $31;
  $33 = HEAP32[$32>>2]|0;
  (FUNCTION_TABLE_iiii[$27 & 15]($24,$30,$33)|0);
 }
 $34 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
 $35 = HEAP32[$34>>2]|0;
 $36 = ((($35)) + 28|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = ((($5)) + 8|0);
 $39 = $38;
 $40 = $39;
 $41 = HEAP32[$40>>2]|0;
 $42 = (($39) + 4)|0;
 $43 = $42;
 $44 = HEAP32[$43>>2]|0;
 $45 = (FUNCTION_TABLE_iiii[$37 & 15]($34,$41,$44)|0);
 $46 = HEAP32[$45>>2]|0;
 $47 = (($46) + -1)|0;
 HEAP32[$45>>2] = $47;
 $48 = ($47|0)==(0);
 if ($48) {
  $49 = HEAP32[$this>>2]|0;
  $50 = ($49|0)==(0|0);
  if (!($50)) {
   $51 = ((($49)) + 8|0);
   $52 = $51;
   $53 = $52;
   $54 = HEAP32[$53>>2]|0;
   $55 = (($52) + 4)|0;
   $56 = $55;
   $57 = HEAP32[$56>>2]|0;
   $58 = ($54|0)==(-1);
   $59 = ($57|0)==(0);
   $60 = $58 & $59;
   if (!($60)) {
    $61 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $62 = HEAP32[$61>>2]|0;
    $63 = ((($62)) + 16|0);
    $64 = HEAP32[$63>>2]|0;
    $65 = HEAP32[$this>>2]|0;
    $66 = ((($65)) + 8|0);
    $67 = $66;
    $68 = $67;
    $69 = HEAP32[$68>>2]|0;
    $70 = (($67) + 4)|0;
    $71 = $70;
    $72 = HEAP32[$71>>2]|0;
    (FUNCTION_TABLE_iiii[$64 & 15]($61,$69,$72)|0);
   }
  }
 }
 HEAP32[$0>>2] = 0;
 __ZN8MID_LockaSERKS_($lock,$0);
 $73 = HEAP32[$this>>2]|0;
 $74 = ($73|0)==(0|0);
 if (!($74)) {
  $75 = HEAP32[$73>>2]|0;
  $76 = ($75|0)>(0);
  if ($76) {
   $77 = (($75) + -1)|0;
   HEAP32[$73>>2] = $77;
   $78 = $77;
  } else {
   $78 = $75;
  }
  $79 = ($78|0)==(0);
  if ($79) {
   $80 = ((($73)) + 8|0);
   $81 = $80;
   $82 = $81;
   $83 = HEAP32[$82>>2]|0;
   $84 = (($81) + 4)|0;
   $85 = $84;
   $86 = HEAP32[$85>>2]|0;
   $87 = ($83|0)==(-1);
   $88 = ($86|0)==(0);
   $89 = $87 & $88;
   if (!($89)) {
    $90 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $91 = HEAP32[$90>>2]|0;
    $92 = ((($91)) + 4|0);
    $93 = HEAP32[$92>>2]|0;
    $94 = HEAP32[$this>>2]|0;
    $95 = ((($94)) + 8|0);
    $96 = $95;
    $97 = $96;
    $98 = HEAP32[$97>>2]|0;
    $99 = (($96) + 4)|0;
    $100 = $99;
    $101 = HEAP32[$100>>2]|0;
    FUNCTION_TABLE_viii[$93 & 0]($90,$98,$101);
   }
   $102 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $103 = HEAP32[$102>>2]|0;
   $104 = ((($103)) + 8|0);
   $105 = HEAP32[$104>>2]|0;
   $106 = HEAP32[$this>>2]|0;
   FUNCTION_TABLE_vii[$105 & 0]($102,$106);
  }
  HEAP32[$this>>2] = 0;
 }
 $107 = HEAP32[136]|0;
 $108 = ($107|0)==(0|0);
 if (!($108)) {
  $109 = HEAP32[$107>>2]|0;
  $110 = ((($109)) + 4|0);
  $111 = HEAP32[$110>>2]|0;
  FUNCTION_TABLE_vi[$111 & 15]($107);
 }
 $112 = HEAP32[$lock>>2]|0;
 $113 = ($112|0)==(0|0);
 if (!($113)) {
  $114 = ((($112)) + 8|0);
  $115 = $114;
  $116 = $115;
  $117 = HEAP32[$116>>2]|0;
  $118 = (($115) + 4)|0;
  $119 = $118;
  $120 = HEAP32[$119>>2]|0;
  $121 = ($117|0)==(-1);
  $122 = ($120|0)==(0);
  $123 = $121 & $122;
  if (!($123)) {
   $124 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
   $125 = HEAP32[$124>>2]|0;
   $126 = ((($125)) + 32|0);
   $127 = HEAP32[$126>>2]|0;
   $128 = $114;
   $129 = $128;
   $130 = HEAP32[$129>>2]|0;
   $131 = (($128) + 4)|0;
   $132 = $131;
   $133 = HEAP32[$132>>2]|0;
   (FUNCTION_TABLE_iiii[$127 & 15]($124,$130,$133)|0);
  }
  $134 = HEAP32[$112>>2]|0;
  $135 = ($134|0)>(0);
  if ($135) {
   $136 = (($134) + -1)|0;
   HEAP32[$112>>2] = $136;
   $137 = $136;
  } else {
   $137 = $134;
  }
  $138 = ($137|0)==(0);
  if ($138) {
   $139 = $114;
   $140 = $139;
   $141 = HEAP32[$140>>2]|0;
   $142 = (($139) + 4)|0;
   $143 = $142;
   $144 = HEAP32[$143>>2]|0;
   $145 = ($141|0)==(-1);
   $146 = ($144|0)==(0);
   $147 = $145 & $146;
   if (!($147)) {
    $148 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $149 = HEAP32[$148>>2]|0;
    $150 = ((($149)) + 4|0);
    $151 = HEAP32[$150>>2]|0;
    $152 = $114;
    $153 = $152;
    $154 = HEAP32[$153>>2]|0;
    $155 = (($152) + 4)|0;
    $156 = $155;
    $157 = HEAP32[$156>>2]|0;
    FUNCTION_TABLE_viii[$151 & 0]($148,$154,$157);
   }
   $158 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $159 = HEAP32[$158>>2]|0;
   $160 = ((($159)) + 8|0);
   $161 = HEAP32[$160>>2]|0;
   FUNCTION_TABLE_vii[$161 & 0]($158,$112);
  }
  HEAP32[$lock>>2] = 0;
 }
 STACKTOP = sp;return;
}
function __ZN8MID_LockaSERKS_($this,$p_lock) {
 $this = $this|0;
 $p_lock = $p_lock|0;
 var $$pr$pre = 0, $$pr1 = 0, $$pr14 = 0, $$pr15 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0;
 var $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0;
 var $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $$pr15 = 0;
 } else {
  $2 = ((($0)) + 8|0);
  $3 = $2;
  $4 = $3;
  $5 = HEAP32[$4>>2]|0;
  $6 = (($3) + 4)|0;
  $7 = $6;
  $8 = HEAP32[$7>>2]|0;
  $9 = ($5|0)==(-1);
  $10 = ($8|0)==(0);
  $11 = $9 & $10;
  if ($11) {
   $$pr15 = $0;
  } else {
   $12 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
   $13 = HEAP32[$12>>2]|0;
   $14 = ((($13)) + 32|0);
   $15 = HEAP32[$14>>2]|0;
   $16 = HEAP32[$this>>2]|0;
   $17 = ((($16)) + 8|0);
   $18 = $17;
   $19 = $18;
   $20 = HEAP32[$19>>2]|0;
   $21 = (($18) + 4)|0;
   $22 = $21;
   $23 = HEAP32[$22>>2]|0;
   (FUNCTION_TABLE_iiii[$15 & 15]($12,$20,$23)|0);
   $$pr$pre = HEAP32[$this>>2]|0;
   $$pr15 = $$pr$pre;
  }
 }
 $24 = HEAP32[$p_lock>>2]|0;
 $25 = ($$pr15|0)==($24|0);
 if ($25) {
  $$pr1 = $$pr15;
  label = 16;
 } else {
  $26 = ($$pr15|0)==(0|0);
  if ($26) {
   $$pr14 = $$pr15;
  } else {
   $27 = HEAP32[$$pr15>>2]|0;
   $28 = ($27|0)>(0);
   if ($28) {
    $29 = (($27) + -1)|0;
    HEAP32[$$pr15>>2] = $29;
    $30 = $29;
   } else {
    $30 = $27;
   }
   $31 = ($30|0)==(0);
   if ($31) {
    $32 = ((($$pr15)) + 8|0);
    $33 = $32;
    $34 = $33;
    $35 = HEAP32[$34>>2]|0;
    $36 = (($33) + 4)|0;
    $37 = $36;
    $38 = HEAP32[$37>>2]|0;
    $39 = ($35|0)==(-1);
    $40 = ($38|0)==(0);
    $41 = $39 & $40;
    if (!($41)) {
     $42 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
     $43 = HEAP32[$42>>2]|0;
     $44 = ((($43)) + 4|0);
     $45 = HEAP32[$44>>2]|0;
     $46 = HEAP32[$this>>2]|0;
     $47 = ((($46)) + 8|0);
     $48 = $47;
     $49 = $48;
     $50 = HEAP32[$49>>2]|0;
     $51 = (($48) + 4)|0;
     $52 = $51;
     $53 = HEAP32[$52>>2]|0;
     FUNCTION_TABLE_viii[$45 & 0]($42,$50,$53);
    }
    $54 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
    $55 = HEAP32[$54>>2]|0;
    $56 = ((($55)) + 8|0);
    $57 = HEAP32[$56>>2]|0;
    $58 = HEAP32[$this>>2]|0;
    FUNCTION_TABLE_vii[$57 & 0]($54,$58);
   }
   HEAP32[$this>>2] = 0;
   $$pr14 = 0;
  }
  $59 = ($24|0)==(0|0);
  if ($59) {
   $$pr1 = $$pr14;
   label = 16;
  } else {
   $60 = HEAP32[$24>>2]|0;
   $61 = ($60|0)==(0);
   if ($61) {
    $$pr1 = $$pr14;
    label = 16;
   } else {
    $62 = (($60) + 1)|0;
    HEAP32[$24>>2] = $62;
    HEAP32[$this>>2] = $24;
    $65 = $24;
   }
  }
 }
 if ((label|0) == 16) {
  $63 = ($$pr1|0)==(0|0);
  if ($63) {
   return;
  } else {
   $65 = $$pr1;
  }
 }
 $64 = ((($65)) + 8|0);
 $66 = $64;
 $67 = $66;
 $68 = HEAP32[$67>>2]|0;
 $69 = (($66) + 4)|0;
 $70 = $69;
 $71 = HEAP32[$70>>2]|0;
 $72 = ($68|0)==(-1);
 $73 = ($71|0)==(0);
 $74 = $72 & $73;
 if ($74) {
  return;
 }
 $75 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
 $76 = HEAP32[$75>>2]|0;
 $77 = ((($76)) + 24|0);
 $78 = HEAP32[$77>>2]|0;
 $79 = HEAP32[$this>>2]|0;
 $80 = ((($79)) + 8|0);
 $81 = $80;
 $82 = $81;
 $83 = HEAP32[$82>>2]|0;
 $84 = (($81) + 4)|0;
 $85 = $84;
 $86 = HEAP32[$85>>2]|0;
 (FUNCTION_TABLE_iiii[$78 & 15]($75,$83,$86)|0);
 return;
}
function __GLOBAL__sub_I_resource_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[133] = 0;
 HEAP32[(540)>>2] = 0;
 HEAP8[(536)>>0] = 0;
 (___cxa_atexit((6|0),(532|0),(___dso_handle|0))|0);
 return;
}
function __ZN7HashMapI6StringP8Resource20HashMapHahserDefaultLh3ELh8EED2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN7HashMapI6StringP8Resource20HashMapHahserDefaultLh3ELh8EE5clearEv($this);
 return;
}
function __ZN7HashMapI6StringP8Resource20HashMapHahserDefaultLh3ELh8EE5clearEv($this) {
 $this = $this|0;
 var $$lcssa = 0, $$pre = 0, $$pre5 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$02 = 0, label = 0;
 var sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 $$pre5 = ((($this)) + 4|0);
 if ($1) {
  HEAP32[$this>>2] = 0;
  HEAP8[$$pre5>>0] = 0;
  $32 = ((($this)) + 8|0);
  HEAP32[$32>>2] = 0;
  return;
 }
 $2 = HEAP8[$$pre5>>0]|0;
 $3 = ($2<<24>>24)==(31);
 if ($3) {
  $9 = $0;
 } else {
  $33 = $2;$5 = $0;$i$02 = 0;
  while(1) {
   $4 = (($5) + ($i$02<<2)|0);
   $6 = HEAP32[$4>>2]|0;
   $7 = ($6|0)==(0|0);
   if ($7) {
    $29 = $33;$34 = $5;
   } else {
    $11 = $6;$13 = $4;
    while(1) {
     $10 = ((($11)) + 4|0);
     $12 = HEAP32[$10>>2]|0;
     HEAP32[$13>>2] = $12;
     $14 = ((($11)) + 8|0);
     $15 = HEAP32[$14>>2]|0;
     $16 = ($15|0)==(0|0);
     if (!($16)) {
      $17 = ((($15)) + -8|0);
      $18 = HEAP32[$17>>2]|0;
      $19 = ($18|0)>(0);
      if ($19) {
       $20 = (($18) + -1)|0;
       HEAP32[$17>>2] = $20;
       $21 = $20;
      } else {
       $21 = $18;
      }
      $22 = ($21|0)==(0);
      if ($22) {
       __ZN6Memory11free_staticEPv($17);
      }
     }
     __ZN6Memory11free_staticEPv($11);
     $23 = HEAP32[$this>>2]|0;
     $24 = (($23) + ($i$02<<2)|0);
     $25 = HEAP32[$24>>2]|0;
     $26 = ($25|0)==(0|0);
     if ($26) {
      $$lcssa = $23;
      break;
     } else {
      $11 = $25;$13 = $24;
     }
    }
    $$pre = HEAP8[$$pre5>>0]|0;
    $29 = $$pre;$34 = $$lcssa;
   }
   $27 = (($i$02) + 1)|0;
   $28 = $29&255;
   $30 = 1 << $28;
   $31 = ($27|0)<($30|0);
   if ($31) {
    $33 = $29;$5 = $34;$i$02 = $27;
   } else {
    $9 = $34;
    break;
   }
  }
 }
 $8 = ((($9)) + -4|0);
 __ZN6Memory11free_staticEPv($8);
 HEAP32[$this>>2] = 0;
 HEAP8[$$pre5>>0] = 0;
 $32 = ((($this)) + 8|0);
 HEAP32[$32>>2] = 0;
 return;
}
function __ZN7DVectorI6StringE11unreferenceEv($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0;
 var $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0;
 var $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0;
 var $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0;
 var $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $exitcond = 0, $i$010 = 0;
 var $lock = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $lock = sp + 4|0;
 $0 = sp;
 $1 = HEAP32[136]|0;
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = HEAP32[$1>>2]|0;
  $4 = HEAP32[$3>>2]|0;
  FUNCTION_TABLE_vi[$4 & 15]($1);
 }
 $5 = HEAP32[$this>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = HEAP32[136]|0;
  $8 = ($7|0)==(0|0);
  if ($8) {
   STACKTOP = sp;return;
  }
  $9 = HEAP32[$7>>2]|0;
  $10 = ((($9)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  FUNCTION_TABLE_vi[$11 & 15]($7);
  STACKTOP = sp;return;
 }
 HEAP32[$lock>>2] = 0;
 $12 = HEAP32[$5>>2]|0;
 $13 = (($12) + 1)|0;
 HEAP32[$5>>2] = $13;
 HEAP32[$lock>>2] = $5;
 $14 = ((($5)) + 8|0);
 $15 = $14;
 $16 = $15;
 $17 = HEAP32[$16>>2]|0;
 $18 = (($15) + 4)|0;
 $19 = $18;
 $20 = HEAP32[$19>>2]|0;
 $21 = ($17|0)==(-1);
 $22 = ($20|0)==(0);
 $23 = $21 & $22;
 if (!($23)) {
  $24 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = ((($25)) + 24|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = $14;
  $29 = $28;
  $30 = HEAP32[$29>>2]|0;
  $31 = (($28) + 4)|0;
  $32 = $31;
  $33 = HEAP32[$32>>2]|0;
  (FUNCTION_TABLE_iiii[$27 & 15]($24,$30,$33)|0);
 }
 $34 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
 $35 = HEAP32[$34>>2]|0;
 $36 = ((($35)) + 28|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = ((($5)) + 8|0);
 $39 = $38;
 $40 = $39;
 $41 = HEAP32[$40>>2]|0;
 $42 = (($39) + 4)|0;
 $43 = $42;
 $44 = HEAP32[$43>>2]|0;
 $45 = (FUNCTION_TABLE_iiii[$37 & 15]($34,$41,$44)|0);
 $46 = HEAP32[$45>>2]|0;
 $47 = (($46) + -1)|0;
 HEAP32[$45>>2] = $47;
 $48 = ($47|0)==(0);
 do {
  if ($48) {
   $49 = ((($45)) + 4|0);
   $50 = HEAP32[$this>>2]|0;
   $51 = ($50|0)==(0|0);
   if ($51) {
    $88 = 1073741823;
   } else {
    $52 = ((($50)) + 8|0);
    $53 = $52;
    $54 = $53;
    $55 = HEAP32[$54>>2]|0;
    $56 = (($53) + 4)|0;
    $57 = $56;
    $58 = HEAP32[$57>>2]|0;
    $59 = ($55|0)==(-1);
    $60 = ($58|0)==(0);
    $61 = $59 & $60;
    if ($61) {
     $88 = 1073741823;
    } else {
     $62 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
     $63 = HEAP32[$62>>2]|0;
     $64 = ((($63)) + 16|0);
     $65 = HEAP32[$64>>2]|0;
     $66 = HEAP32[$this>>2]|0;
     $67 = ((($66)) + 8|0);
     $68 = $67;
     $69 = $68;
     $70 = HEAP32[$69>>2]|0;
     $71 = (($68) + 4)|0;
     $72 = $71;
     $73 = HEAP32[$72>>2]|0;
     $74 = (FUNCTION_TABLE_iiii[$65 & 15]($62,$70,$73)|0);
     $75 = (($74) + -4)|0;
     $76 = $75 >>> 2;
     $77 = ($76|0)==(0);
     if ($77) {
      break;
     } else {
      $88 = $76;
     }
    }
   }
   $i$010 = 0;
   while(1) {
    $78 = (($49) + ($i$010<<2)|0);
    $79 = HEAP32[$78>>2]|0;
    $80 = ($79|0)==(0|0);
    if (!($80)) {
     $81 = ((($79)) + -8|0);
     $82 = HEAP32[$81>>2]|0;
     $83 = ($82|0)>(0);
     if ($83) {
      $84 = (($82) + -1)|0;
      HEAP32[$81>>2] = $84;
      $85 = $84;
     } else {
      $85 = $82;
     }
     $86 = ($85|0)==(0);
     if ($86) {
      __ZN6Memory11free_staticEPv($81);
     }
    }
    $87 = (($i$010) + 1)|0;
    $exitcond = ($87|0)==($88|0);
    if ($exitcond) {
     break;
    } else {
     $i$010 = $87;
    }
   }
  }
 } while(0);
 HEAP32[$0>>2] = 0;
 __ZN8MID_LockaSERKS_($lock,$0);
 $89 = HEAP32[$this>>2]|0;
 $90 = ($89|0)==(0|0);
 if (!($90)) {
  $91 = HEAP32[$89>>2]|0;
  $92 = ($91|0)>(0);
  if ($92) {
   $93 = (($91) + -1)|0;
   HEAP32[$89>>2] = $93;
   $94 = $93;
  } else {
   $94 = $91;
  }
  $95 = ($94|0)==(0);
  if ($95) {
   $96 = ((($89)) + 8|0);
   $97 = $96;
   $98 = $97;
   $99 = HEAP32[$98>>2]|0;
   $100 = (($97) + 4)|0;
   $101 = $100;
   $102 = HEAP32[$101>>2]|0;
   $103 = ($99|0)==(-1);
   $104 = ($102|0)==(0);
   $105 = $103 & $104;
   if (!($105)) {
    $106 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $107 = HEAP32[$106>>2]|0;
    $108 = ((($107)) + 4|0);
    $109 = HEAP32[$108>>2]|0;
    $110 = HEAP32[$this>>2]|0;
    $111 = ((($110)) + 8|0);
    $112 = $111;
    $113 = $112;
    $114 = HEAP32[$113>>2]|0;
    $115 = (($112) + 4)|0;
    $116 = $115;
    $117 = HEAP32[$116>>2]|0;
    FUNCTION_TABLE_viii[$109 & 0]($106,$114,$117);
   }
   $118 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $119 = HEAP32[$118>>2]|0;
   $120 = ((($119)) + 8|0);
   $121 = HEAP32[$120>>2]|0;
   $122 = HEAP32[$this>>2]|0;
   FUNCTION_TABLE_vii[$121 & 0]($118,$122);
  }
  HEAP32[$this>>2] = 0;
 }
 $123 = HEAP32[136]|0;
 $124 = ($123|0)==(0|0);
 if (!($124)) {
  $125 = HEAP32[$123>>2]|0;
  $126 = ((($125)) + 4|0);
  $127 = HEAP32[$126>>2]|0;
  FUNCTION_TABLE_vi[$127 & 15]($123);
 }
 $128 = HEAP32[$lock>>2]|0;
 $129 = ($128|0)==(0|0);
 if (!($129)) {
  $130 = ((($128)) + 8|0);
  $131 = $130;
  $132 = $131;
  $133 = HEAP32[$132>>2]|0;
  $134 = (($131) + 4)|0;
  $135 = $134;
  $136 = HEAP32[$135>>2]|0;
  $137 = ($133|0)==(-1);
  $138 = ($136|0)==(0);
  $139 = $137 & $138;
  if (!($139)) {
   $140 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
   $141 = HEAP32[$140>>2]|0;
   $142 = ((($141)) + 32|0);
   $143 = HEAP32[$142>>2]|0;
   $144 = $130;
   $145 = $144;
   $146 = HEAP32[$145>>2]|0;
   $147 = (($144) + 4)|0;
   $148 = $147;
   $149 = HEAP32[$148>>2]|0;
   (FUNCTION_TABLE_iiii[$143 & 15]($140,$146,$149)|0);
  }
  $150 = HEAP32[$128>>2]|0;
  $151 = ($150|0)>(0);
  if ($151) {
   $152 = (($150) + -1)|0;
   HEAP32[$128>>2] = $152;
   $153 = $152;
  } else {
   $153 = $150;
  }
  $154 = ($153|0)==(0);
  if ($154) {
   $155 = $130;
   $156 = $155;
   $157 = HEAP32[$156>>2]|0;
   $158 = (($155) + 4)|0;
   $159 = $158;
   $160 = HEAP32[$159>>2]|0;
   $161 = ($157|0)==(-1);
   $162 = ($160|0)==(0);
   $163 = $161 & $162;
   if (!($163)) {
    $164 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $165 = HEAP32[$164>>2]|0;
    $166 = ((($165)) + 4|0);
    $167 = HEAP32[$166>>2]|0;
    $168 = $130;
    $169 = $168;
    $170 = HEAP32[$169>>2]|0;
    $171 = (($168) + 4)|0;
    $172 = $171;
    $173 = HEAP32[$172>>2]|0;
    FUNCTION_TABLE_viii[$167 & 0]($164,$170,$173);
   }
   $174 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $175 = HEAP32[$174>>2]|0;
   $176 = ((($175)) + 8|0);
   $177 = HEAP32[$176>>2]|0;
   FUNCTION_TABLE_vii[$177 & 0]($174,$128);
  }
  HEAP32[$lock>>2] = 0;
 }
 STACKTOP = sp;return;
}
function __ZN7DVectorIiE11unreferenceEv($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, $lock = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $lock = sp + 4|0;
 $0 = sp;
 $1 = HEAP32[136]|0;
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = HEAP32[$1>>2]|0;
  $4 = HEAP32[$3>>2]|0;
  FUNCTION_TABLE_vi[$4 & 15]($1);
 }
 $5 = HEAP32[$this>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = HEAP32[136]|0;
  $8 = ($7|0)==(0|0);
  if ($8) {
   STACKTOP = sp;return;
  }
  $9 = HEAP32[$7>>2]|0;
  $10 = ((($9)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  FUNCTION_TABLE_vi[$11 & 15]($7);
  STACKTOP = sp;return;
 }
 HEAP32[$lock>>2] = 0;
 $12 = HEAP32[$5>>2]|0;
 $13 = (($12) + 1)|0;
 HEAP32[$5>>2] = $13;
 HEAP32[$lock>>2] = $5;
 $14 = ((($5)) + 8|0);
 $15 = $14;
 $16 = $15;
 $17 = HEAP32[$16>>2]|0;
 $18 = (($15) + 4)|0;
 $19 = $18;
 $20 = HEAP32[$19>>2]|0;
 $21 = ($17|0)==(-1);
 $22 = ($20|0)==(0);
 $23 = $21 & $22;
 if (!($23)) {
  $24 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = ((($25)) + 24|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = $14;
  $29 = $28;
  $30 = HEAP32[$29>>2]|0;
  $31 = (($28) + 4)|0;
  $32 = $31;
  $33 = HEAP32[$32>>2]|0;
  (FUNCTION_TABLE_iiii[$27 & 15]($24,$30,$33)|0);
 }
 $34 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
 $35 = HEAP32[$34>>2]|0;
 $36 = ((($35)) + 28|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = ((($5)) + 8|0);
 $39 = $38;
 $40 = $39;
 $41 = HEAP32[$40>>2]|0;
 $42 = (($39) + 4)|0;
 $43 = $42;
 $44 = HEAP32[$43>>2]|0;
 $45 = (FUNCTION_TABLE_iiii[$37 & 15]($34,$41,$44)|0);
 $46 = HEAP32[$45>>2]|0;
 $47 = (($46) + -1)|0;
 HEAP32[$45>>2] = $47;
 $48 = ($47|0)==(0);
 if ($48) {
  $49 = HEAP32[$this>>2]|0;
  $50 = ($49|0)==(0|0);
  if (!($50)) {
   $51 = ((($49)) + 8|0);
   $52 = $51;
   $53 = $52;
   $54 = HEAP32[$53>>2]|0;
   $55 = (($52) + 4)|0;
   $56 = $55;
   $57 = HEAP32[$56>>2]|0;
   $58 = ($54|0)==(-1);
   $59 = ($57|0)==(0);
   $60 = $58 & $59;
   if (!($60)) {
    $61 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $62 = HEAP32[$61>>2]|0;
    $63 = ((($62)) + 16|0);
    $64 = HEAP32[$63>>2]|0;
    $65 = HEAP32[$this>>2]|0;
    $66 = ((($65)) + 8|0);
    $67 = $66;
    $68 = $67;
    $69 = HEAP32[$68>>2]|0;
    $70 = (($67) + 4)|0;
    $71 = $70;
    $72 = HEAP32[$71>>2]|0;
    (FUNCTION_TABLE_iiii[$64 & 15]($61,$69,$72)|0);
   }
  }
 }
 HEAP32[$0>>2] = 0;
 __ZN8MID_LockaSERKS_($lock,$0);
 $73 = HEAP32[$this>>2]|0;
 $74 = ($73|0)==(0|0);
 if (!($74)) {
  $75 = HEAP32[$73>>2]|0;
  $76 = ($75|0)>(0);
  if ($76) {
   $77 = (($75) + -1)|0;
   HEAP32[$73>>2] = $77;
   $78 = $77;
  } else {
   $78 = $75;
  }
  $79 = ($78|0)==(0);
  if ($79) {
   $80 = ((($73)) + 8|0);
   $81 = $80;
   $82 = $81;
   $83 = HEAP32[$82>>2]|0;
   $84 = (($81) + 4)|0;
   $85 = $84;
   $86 = HEAP32[$85>>2]|0;
   $87 = ($83|0)==(-1);
   $88 = ($86|0)==(0);
   $89 = $87 & $88;
   if (!($89)) {
    $90 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $91 = HEAP32[$90>>2]|0;
    $92 = ((($91)) + 4|0);
    $93 = HEAP32[$92>>2]|0;
    $94 = HEAP32[$this>>2]|0;
    $95 = ((($94)) + 8|0);
    $96 = $95;
    $97 = $96;
    $98 = HEAP32[$97>>2]|0;
    $99 = (($96) + 4)|0;
    $100 = $99;
    $101 = HEAP32[$100>>2]|0;
    FUNCTION_TABLE_viii[$93 & 0]($90,$98,$101);
   }
   $102 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $103 = HEAP32[$102>>2]|0;
   $104 = ((($103)) + 8|0);
   $105 = HEAP32[$104>>2]|0;
   $106 = HEAP32[$this>>2]|0;
   FUNCTION_TABLE_vii[$105 & 0]($102,$106);
  }
  HEAP32[$this>>2] = 0;
 }
 $107 = HEAP32[136]|0;
 $108 = ($107|0)==(0|0);
 if (!($108)) {
  $109 = HEAP32[$107>>2]|0;
  $110 = ((($109)) + 4|0);
  $111 = HEAP32[$110>>2]|0;
  FUNCTION_TABLE_vi[$111 & 15]($107);
 }
 $112 = HEAP32[$lock>>2]|0;
 $113 = ($112|0)==(0|0);
 if (!($113)) {
  $114 = ((($112)) + 8|0);
  $115 = $114;
  $116 = $115;
  $117 = HEAP32[$116>>2]|0;
  $118 = (($115) + 4)|0;
  $119 = $118;
  $120 = HEAP32[$119>>2]|0;
  $121 = ($117|0)==(-1);
  $122 = ($120|0)==(0);
  $123 = $121 & $122;
  if (!($123)) {
   $124 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
   $125 = HEAP32[$124>>2]|0;
   $126 = ((($125)) + 32|0);
   $127 = HEAP32[$126>>2]|0;
   $128 = $114;
   $129 = $128;
   $130 = HEAP32[$129>>2]|0;
   $131 = (($128) + 4)|0;
   $132 = $131;
   $133 = HEAP32[$132>>2]|0;
   (FUNCTION_TABLE_iiii[$127 & 15]($124,$130,$133)|0);
  }
  $134 = HEAP32[$112>>2]|0;
  $135 = ($134|0)>(0);
  if ($135) {
   $136 = (($134) + -1)|0;
   HEAP32[$112>>2] = $136;
   $137 = $136;
  } else {
   $137 = $134;
  }
  $138 = ($137|0)==(0);
  if ($138) {
   $139 = $114;
   $140 = $139;
   $141 = HEAP32[$140>>2]|0;
   $142 = (($139) + 4)|0;
   $143 = $142;
   $144 = HEAP32[$143>>2]|0;
   $145 = ($141|0)==(-1);
   $146 = ($144|0)==(0);
   $147 = $145 & $146;
   if (!($147)) {
    $148 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $149 = HEAP32[$148>>2]|0;
    $150 = ((($149)) + 4|0);
    $151 = HEAP32[$150>>2]|0;
    $152 = $114;
    $153 = $152;
    $154 = HEAP32[$153>>2]|0;
    $155 = (($152) + 4)|0;
    $156 = $155;
    $157 = HEAP32[$156>>2]|0;
    FUNCTION_TABLE_viii[$151 & 0]($148,$154,$157);
   }
   $158 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $159 = HEAP32[$158>>2]|0;
   $160 = ((($159)) + 8|0);
   $161 = HEAP32[$160>>2]|0;
   FUNCTION_TABLE_vii[$161 & 0]($158,$112);
  }
  HEAP32[$lock>>2] = 0;
 }
 STACKTOP = sp;return;
}
function __ZN7Variant5clearEv($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0;
 var $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0;
 var $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0;
 var $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0;
 var $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0;
 var $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0;
 var $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0;
 var $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0;
 var $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0;
 var $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0;
 var $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 do {
  switch ($0|0) {
  case 4:  {
   $1 = ((($this)) + 8|0);
   $2 = HEAP32[$1>>2]|0;
   $3 = ($2|0)==(0|0);
   if ($3) {
    HEAP32[$this>>2] = 0;
    return;
   }
   $4 = ((($2)) + -8|0);
   $5 = HEAP32[$4>>2]|0;
   $6 = ($5|0)>(0);
   if ($6) {
    $7 = (($5) + -1)|0;
    HEAP32[$4>>2] = $7;
    $8 = $7;
   } else {
    $8 = $5;
   }
   $9 = ($8|0)==(0);
   if (!($9)) {
    HEAP32[$this>>2] = 0;
    return;
   }
   __ZN6Memory11free_staticEPv($4);
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 8:  {
   $10 = ((($this)) + 8|0);
   $11 = HEAP32[$10>>2]|0;
   __ZN6Memory11free_staticEPv($11);
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 11:  {
   $12 = ((($this)) + 8|0);
   $13 = HEAP32[$12>>2]|0;
   __ZN6Memory11free_staticEPv($13);
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 12:  {
   $14 = ((($this)) + 8|0);
   $15 = HEAP32[$14>>2]|0;
   __ZN6Memory11free_staticEPv($15);
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 13:  {
   $16 = ((($this)) + 8|0);
   $17 = HEAP32[$16>>2]|0;
   __ZN6Memory11free_staticEPv($17);
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 15:  {
   $18 = ((($this)) + 8|0);
   $19 = HEAP32[$18>>2]|0;
   __ZN5ImageD2Ev($19);
   __ZN6Memory11free_staticEPv($19);
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 16:  {
   $20 = ((($this)) + 8|0);
   __ZN8NodePathD2Ev($20);
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 18:  {
   $21 = ((($this)) + 8|0);
   HEAP32[$21>>2] = 0;
   $22 = ((($21)) + 4|0);
   __ZN6RefPtr5unrefEv($22);
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 28:  {
   $237 = ((($this)) + 8|0);
   __ZN7DVectorI5ColorE11unreferenceEv($237);
   $238 = HEAP32[$237>>2]|0;
   $239 = ($238|0)==(0|0);
   if ($239) {
    HEAP32[$this>>2] = 0;
    return;
   }
   $240 = HEAP32[$238>>2]|0;
   $241 = ($240|0)>(0);
   if ($241) {
    $242 = (($240) + -1)|0;
    HEAP32[$238>>2] = $242;
    $243 = $242;
   } else {
    $243 = $240;
   }
   $244 = ($243|0)==(0);
   if ($244) {
    $245 = ((($238)) + 8|0);
    $246 = $245;
    $247 = $246;
    $248 = HEAP32[$247>>2]|0;
    $249 = (($246) + 4)|0;
    $250 = $249;
    $251 = HEAP32[$250>>2]|0;
    $252 = ($248|0)==(-1);
    $253 = ($251|0)==(0);
    $254 = $252 & $253;
    if (!($254)) {
     $255 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
     $256 = HEAP32[$255>>2]|0;
     $257 = ((($256)) + 4|0);
     $258 = HEAP32[$257>>2]|0;
     $259 = HEAP32[$237>>2]|0;
     $260 = ((($259)) + 8|0);
     $261 = $260;
     $262 = $261;
     $263 = HEAP32[$262>>2]|0;
     $264 = (($261) + 4)|0;
     $265 = $264;
     $266 = HEAP32[$265>>2]|0;
     FUNCTION_TABLE_viii[$258 & 0]($255,$263,$266);
    }
    $267 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
    $268 = HEAP32[$267>>2]|0;
    $269 = ((($268)) + 8|0);
    $270 = HEAP32[$269>>2]|0;
    $271 = HEAP32[$237>>2]|0;
    FUNCTION_TABLE_vii[$270 & 0]($267,$271);
   }
   HEAP32[$237>>2] = 0;
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 20:  {
   $23 = ((($this)) + 8|0);
   __ZN10DictionaryD2Ev($23);
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 21:  {
   $24 = ((($this)) + 8|0);
   __ZN5ArrayD2Ev($24);
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 19:  {
   $25 = ((($this)) + 8|0);
   $26 = HEAP32[$25>>2]|0;
   __ZN6Memory11free_staticEPv($26);
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 22:  {
   $27 = ((($this)) + 8|0);
   __ZN7DVectorIhE11unreferenceEv($27);
   $28 = HEAP32[$27>>2]|0;
   $29 = ($28|0)==(0|0);
   if ($29) {
    HEAP32[$this>>2] = 0;
    return;
   }
   $30 = HEAP32[$28>>2]|0;
   $31 = ($30|0)>(0);
   if ($31) {
    $32 = (($30) + -1)|0;
    HEAP32[$28>>2] = $32;
    $33 = $32;
   } else {
    $33 = $30;
   }
   $34 = ($33|0)==(0);
   if ($34) {
    $35 = ((($28)) + 8|0);
    $36 = $35;
    $37 = $36;
    $38 = HEAP32[$37>>2]|0;
    $39 = (($36) + 4)|0;
    $40 = $39;
    $41 = HEAP32[$40>>2]|0;
    $42 = ($38|0)==(-1);
    $43 = ($41|0)==(0);
    $44 = $42 & $43;
    if (!($44)) {
     $45 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
     $46 = HEAP32[$45>>2]|0;
     $47 = ((($46)) + 4|0);
     $48 = HEAP32[$47>>2]|0;
     $49 = HEAP32[$27>>2]|0;
     $50 = ((($49)) + 8|0);
     $51 = $50;
     $52 = $51;
     $53 = HEAP32[$52>>2]|0;
     $54 = (($51) + 4)|0;
     $55 = $54;
     $56 = HEAP32[$55>>2]|0;
     FUNCTION_TABLE_viii[$48 & 0]($45,$53,$56);
    }
    $57 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
    $58 = HEAP32[$57>>2]|0;
    $59 = ((($58)) + 8|0);
    $60 = HEAP32[$59>>2]|0;
    $61 = HEAP32[$27>>2]|0;
    FUNCTION_TABLE_vii[$60 & 0]($57,$61);
   }
   HEAP32[$27>>2] = 0;
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 23:  {
   $62 = ((($this)) + 8|0);
   __ZN7DVectorIiE11unreferenceEv($62);
   $63 = HEAP32[$62>>2]|0;
   $64 = ($63|0)==(0|0);
   if ($64) {
    HEAP32[$this>>2] = 0;
    return;
   }
   $65 = HEAP32[$63>>2]|0;
   $66 = ($65|0)>(0);
   if ($66) {
    $67 = (($65) + -1)|0;
    HEAP32[$63>>2] = $67;
    $68 = $67;
   } else {
    $68 = $65;
   }
   $69 = ($68|0)==(0);
   if ($69) {
    $70 = ((($63)) + 8|0);
    $71 = $70;
    $72 = $71;
    $73 = HEAP32[$72>>2]|0;
    $74 = (($71) + 4)|0;
    $75 = $74;
    $76 = HEAP32[$75>>2]|0;
    $77 = ($73|0)==(-1);
    $78 = ($76|0)==(0);
    $79 = $77 & $78;
    if (!($79)) {
     $80 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
     $81 = HEAP32[$80>>2]|0;
     $82 = ((($81)) + 4|0);
     $83 = HEAP32[$82>>2]|0;
     $84 = HEAP32[$62>>2]|0;
     $85 = ((($84)) + 8|0);
     $86 = $85;
     $87 = $86;
     $88 = HEAP32[$87>>2]|0;
     $89 = (($86) + 4)|0;
     $90 = $89;
     $91 = HEAP32[$90>>2]|0;
     FUNCTION_TABLE_viii[$83 & 0]($80,$88,$91);
    }
    $92 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
    $93 = HEAP32[$92>>2]|0;
    $94 = ((($93)) + 8|0);
    $95 = HEAP32[$94>>2]|0;
    $96 = HEAP32[$62>>2]|0;
    FUNCTION_TABLE_vii[$95 & 0]($92,$96);
   }
   HEAP32[$62>>2] = 0;
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 24:  {
   $97 = ((($this)) + 8|0);
   __ZN7DVectorIfE11unreferenceEv($97);
   $98 = HEAP32[$97>>2]|0;
   $99 = ($98|0)==(0|0);
   if ($99) {
    HEAP32[$this>>2] = 0;
    return;
   }
   $100 = HEAP32[$98>>2]|0;
   $101 = ($100|0)>(0);
   if ($101) {
    $102 = (($100) + -1)|0;
    HEAP32[$98>>2] = $102;
    $103 = $102;
   } else {
    $103 = $100;
   }
   $104 = ($103|0)==(0);
   if ($104) {
    $105 = ((($98)) + 8|0);
    $106 = $105;
    $107 = $106;
    $108 = HEAP32[$107>>2]|0;
    $109 = (($106) + 4)|0;
    $110 = $109;
    $111 = HEAP32[$110>>2]|0;
    $112 = ($108|0)==(-1);
    $113 = ($111|0)==(0);
    $114 = $112 & $113;
    if (!($114)) {
     $115 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
     $116 = HEAP32[$115>>2]|0;
     $117 = ((($116)) + 4|0);
     $118 = HEAP32[$117>>2]|0;
     $119 = HEAP32[$97>>2]|0;
     $120 = ((($119)) + 8|0);
     $121 = $120;
     $122 = $121;
     $123 = HEAP32[$122>>2]|0;
     $124 = (($121) + 4)|0;
     $125 = $124;
     $126 = HEAP32[$125>>2]|0;
     FUNCTION_TABLE_viii[$118 & 0]($115,$123,$126);
    }
    $127 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
    $128 = HEAP32[$127>>2]|0;
    $129 = ((($128)) + 8|0);
    $130 = HEAP32[$129>>2]|0;
    $131 = HEAP32[$97>>2]|0;
    FUNCTION_TABLE_vii[$130 & 0]($127,$131);
   }
   HEAP32[$97>>2] = 0;
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 25:  {
   $132 = ((($this)) + 8|0);
   __ZN7DVectorI6StringE11unreferenceEv($132);
   $133 = HEAP32[$132>>2]|0;
   $134 = ($133|0)==(0|0);
   if ($134) {
    HEAP32[$this>>2] = 0;
    return;
   }
   $135 = HEAP32[$133>>2]|0;
   $136 = ($135|0)>(0);
   if ($136) {
    $137 = (($135) + -1)|0;
    HEAP32[$133>>2] = $137;
    $138 = $137;
   } else {
    $138 = $135;
   }
   $139 = ($138|0)==(0);
   if ($139) {
    $140 = ((($133)) + 8|0);
    $141 = $140;
    $142 = $141;
    $143 = HEAP32[$142>>2]|0;
    $144 = (($141) + 4)|0;
    $145 = $144;
    $146 = HEAP32[$145>>2]|0;
    $147 = ($143|0)==(-1);
    $148 = ($146|0)==(0);
    $149 = $147 & $148;
    if (!($149)) {
     $150 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
     $151 = HEAP32[$150>>2]|0;
     $152 = ((($151)) + 4|0);
     $153 = HEAP32[$152>>2]|0;
     $154 = HEAP32[$132>>2]|0;
     $155 = ((($154)) + 8|0);
     $156 = $155;
     $157 = $156;
     $158 = HEAP32[$157>>2]|0;
     $159 = (($156) + 4)|0;
     $160 = $159;
     $161 = HEAP32[$160>>2]|0;
     FUNCTION_TABLE_viii[$153 & 0]($150,$158,$161);
    }
    $162 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
    $163 = HEAP32[$162>>2]|0;
    $164 = ((($163)) + 8|0);
    $165 = HEAP32[$164>>2]|0;
    $166 = HEAP32[$132>>2]|0;
    FUNCTION_TABLE_vii[$165 & 0]($162,$166);
   }
   HEAP32[$132>>2] = 0;
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 26:  {
   $167 = ((($this)) + 8|0);
   __ZN7DVectorI7Vector2E11unreferenceEv($167);
   $168 = HEAP32[$167>>2]|0;
   $169 = ($168|0)==(0|0);
   if ($169) {
    HEAP32[$this>>2] = 0;
    return;
   }
   $170 = HEAP32[$168>>2]|0;
   $171 = ($170|0)>(0);
   if ($171) {
    $172 = (($170) + -1)|0;
    HEAP32[$168>>2] = $172;
    $173 = $172;
   } else {
    $173 = $170;
   }
   $174 = ($173|0)==(0);
   if ($174) {
    $175 = ((($168)) + 8|0);
    $176 = $175;
    $177 = $176;
    $178 = HEAP32[$177>>2]|0;
    $179 = (($176) + 4)|0;
    $180 = $179;
    $181 = HEAP32[$180>>2]|0;
    $182 = ($178|0)==(-1);
    $183 = ($181|0)==(0);
    $184 = $182 & $183;
    if (!($184)) {
     $185 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
     $186 = HEAP32[$185>>2]|0;
     $187 = ((($186)) + 4|0);
     $188 = HEAP32[$187>>2]|0;
     $189 = HEAP32[$167>>2]|0;
     $190 = ((($189)) + 8|0);
     $191 = $190;
     $192 = $191;
     $193 = HEAP32[$192>>2]|0;
     $194 = (($191) + 4)|0;
     $195 = $194;
     $196 = HEAP32[$195>>2]|0;
     FUNCTION_TABLE_viii[$188 & 0]($185,$193,$196);
    }
    $197 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
    $198 = HEAP32[$197>>2]|0;
    $199 = ((($198)) + 8|0);
    $200 = HEAP32[$199>>2]|0;
    $201 = HEAP32[$167>>2]|0;
    FUNCTION_TABLE_vii[$200 & 0]($197,$201);
   }
   HEAP32[$167>>2] = 0;
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  case 27:  {
   $202 = ((($this)) + 8|0);
   __ZN7DVectorI7Vector3E11unreferenceEv($202);
   $203 = HEAP32[$202>>2]|0;
   $204 = ($203|0)==(0|0);
   if ($204) {
    HEAP32[$this>>2] = 0;
    return;
   }
   $205 = HEAP32[$203>>2]|0;
   $206 = ($205|0)>(0);
   if ($206) {
    $207 = (($205) + -1)|0;
    HEAP32[$203>>2] = $207;
    $208 = $207;
   } else {
    $208 = $205;
   }
   $209 = ($208|0)==(0);
   if ($209) {
    $210 = ((($203)) + 8|0);
    $211 = $210;
    $212 = $211;
    $213 = HEAP32[$212>>2]|0;
    $214 = (($211) + 4)|0;
    $215 = $214;
    $216 = HEAP32[$215>>2]|0;
    $217 = ($213|0)==(-1);
    $218 = ($216|0)==(0);
    $219 = $217 & $218;
    if (!($219)) {
     $220 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
     $221 = HEAP32[$220>>2]|0;
     $222 = ((($221)) + 4|0);
     $223 = HEAP32[$222>>2]|0;
     $224 = HEAP32[$202>>2]|0;
     $225 = ((($224)) + 8|0);
     $226 = $225;
     $227 = $226;
     $228 = HEAP32[$227>>2]|0;
     $229 = (($226) + 4)|0;
     $230 = $229;
     $231 = HEAP32[$230>>2]|0;
     FUNCTION_TABLE_viii[$223 & 0]($220,$228,$231);
    }
    $232 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
    $233 = HEAP32[$232>>2]|0;
    $234 = ((($233)) + 8|0);
    $235 = HEAP32[$234>>2]|0;
    $236 = HEAP32[$202>>2]|0;
    FUNCTION_TABLE_vii[$235 & 0]($232,$236);
   }
   HEAP32[$202>>2] = 0;
   HEAP32[$this>>2] = 0;
   return;
   break;
  }
  default: {
   HEAP32[$this>>2] = 0;
   return;
  }
  }
 } while(0);
}
function __ZN7DVectorIfE11unreferenceEv($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, $lock = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $lock = sp + 4|0;
 $0 = sp;
 $1 = HEAP32[136]|0;
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = HEAP32[$1>>2]|0;
  $4 = HEAP32[$3>>2]|0;
  FUNCTION_TABLE_vi[$4 & 15]($1);
 }
 $5 = HEAP32[$this>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = HEAP32[136]|0;
  $8 = ($7|0)==(0|0);
  if ($8) {
   STACKTOP = sp;return;
  }
  $9 = HEAP32[$7>>2]|0;
  $10 = ((($9)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  FUNCTION_TABLE_vi[$11 & 15]($7);
  STACKTOP = sp;return;
 }
 HEAP32[$lock>>2] = 0;
 $12 = HEAP32[$5>>2]|0;
 $13 = (($12) + 1)|0;
 HEAP32[$5>>2] = $13;
 HEAP32[$lock>>2] = $5;
 $14 = ((($5)) + 8|0);
 $15 = $14;
 $16 = $15;
 $17 = HEAP32[$16>>2]|0;
 $18 = (($15) + 4)|0;
 $19 = $18;
 $20 = HEAP32[$19>>2]|0;
 $21 = ($17|0)==(-1);
 $22 = ($20|0)==(0);
 $23 = $21 & $22;
 if (!($23)) {
  $24 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = ((($25)) + 24|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = $14;
  $29 = $28;
  $30 = HEAP32[$29>>2]|0;
  $31 = (($28) + 4)|0;
  $32 = $31;
  $33 = HEAP32[$32>>2]|0;
  (FUNCTION_TABLE_iiii[$27 & 15]($24,$30,$33)|0);
 }
 $34 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
 $35 = HEAP32[$34>>2]|0;
 $36 = ((($35)) + 28|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = ((($5)) + 8|0);
 $39 = $38;
 $40 = $39;
 $41 = HEAP32[$40>>2]|0;
 $42 = (($39) + 4)|0;
 $43 = $42;
 $44 = HEAP32[$43>>2]|0;
 $45 = (FUNCTION_TABLE_iiii[$37 & 15]($34,$41,$44)|0);
 $46 = HEAP32[$45>>2]|0;
 $47 = (($46) + -1)|0;
 HEAP32[$45>>2] = $47;
 $48 = ($47|0)==(0);
 if ($48) {
  $49 = HEAP32[$this>>2]|0;
  $50 = ($49|0)==(0|0);
  if (!($50)) {
   $51 = ((($49)) + 8|0);
   $52 = $51;
   $53 = $52;
   $54 = HEAP32[$53>>2]|0;
   $55 = (($52) + 4)|0;
   $56 = $55;
   $57 = HEAP32[$56>>2]|0;
   $58 = ($54|0)==(-1);
   $59 = ($57|0)==(0);
   $60 = $58 & $59;
   if (!($60)) {
    $61 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $62 = HEAP32[$61>>2]|0;
    $63 = ((($62)) + 16|0);
    $64 = HEAP32[$63>>2]|0;
    $65 = HEAP32[$this>>2]|0;
    $66 = ((($65)) + 8|0);
    $67 = $66;
    $68 = $67;
    $69 = HEAP32[$68>>2]|0;
    $70 = (($67) + 4)|0;
    $71 = $70;
    $72 = HEAP32[$71>>2]|0;
    (FUNCTION_TABLE_iiii[$64 & 15]($61,$69,$72)|0);
   }
  }
 }
 HEAP32[$0>>2] = 0;
 __ZN8MID_LockaSERKS_($lock,$0);
 $73 = HEAP32[$this>>2]|0;
 $74 = ($73|0)==(0|0);
 if (!($74)) {
  $75 = HEAP32[$73>>2]|0;
  $76 = ($75|0)>(0);
  if ($76) {
   $77 = (($75) + -1)|0;
   HEAP32[$73>>2] = $77;
   $78 = $77;
  } else {
   $78 = $75;
  }
  $79 = ($78|0)==(0);
  if ($79) {
   $80 = ((($73)) + 8|0);
   $81 = $80;
   $82 = $81;
   $83 = HEAP32[$82>>2]|0;
   $84 = (($81) + 4)|0;
   $85 = $84;
   $86 = HEAP32[$85>>2]|0;
   $87 = ($83|0)==(-1);
   $88 = ($86|0)==(0);
   $89 = $87 & $88;
   if (!($89)) {
    $90 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $91 = HEAP32[$90>>2]|0;
    $92 = ((($91)) + 4|0);
    $93 = HEAP32[$92>>2]|0;
    $94 = HEAP32[$this>>2]|0;
    $95 = ((($94)) + 8|0);
    $96 = $95;
    $97 = $96;
    $98 = HEAP32[$97>>2]|0;
    $99 = (($96) + 4)|0;
    $100 = $99;
    $101 = HEAP32[$100>>2]|0;
    FUNCTION_TABLE_viii[$93 & 0]($90,$98,$101);
   }
   $102 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $103 = HEAP32[$102>>2]|0;
   $104 = ((($103)) + 8|0);
   $105 = HEAP32[$104>>2]|0;
   $106 = HEAP32[$this>>2]|0;
   FUNCTION_TABLE_vii[$105 & 0]($102,$106);
  }
  HEAP32[$this>>2] = 0;
 }
 $107 = HEAP32[136]|0;
 $108 = ($107|0)==(0|0);
 if (!($108)) {
  $109 = HEAP32[$107>>2]|0;
  $110 = ((($109)) + 4|0);
  $111 = HEAP32[$110>>2]|0;
  FUNCTION_TABLE_vi[$111 & 15]($107);
 }
 $112 = HEAP32[$lock>>2]|0;
 $113 = ($112|0)==(0|0);
 if (!($113)) {
  $114 = ((($112)) + 8|0);
  $115 = $114;
  $116 = $115;
  $117 = HEAP32[$116>>2]|0;
  $118 = (($115) + 4)|0;
  $119 = $118;
  $120 = HEAP32[$119>>2]|0;
  $121 = ($117|0)==(-1);
  $122 = ($120|0)==(0);
  $123 = $121 & $122;
  if (!($123)) {
   $124 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
   $125 = HEAP32[$124>>2]|0;
   $126 = ((($125)) + 32|0);
   $127 = HEAP32[$126>>2]|0;
   $128 = $114;
   $129 = $128;
   $130 = HEAP32[$129>>2]|0;
   $131 = (($128) + 4)|0;
   $132 = $131;
   $133 = HEAP32[$132>>2]|0;
   (FUNCTION_TABLE_iiii[$127 & 15]($124,$130,$133)|0);
  }
  $134 = HEAP32[$112>>2]|0;
  $135 = ($134|0)>(0);
  if ($135) {
   $136 = (($134) + -1)|0;
   HEAP32[$112>>2] = $136;
   $137 = $136;
  } else {
   $137 = $134;
  }
  $138 = ($137|0)==(0);
  if ($138) {
   $139 = $114;
   $140 = $139;
   $141 = HEAP32[$140>>2]|0;
   $142 = (($139) + 4)|0;
   $143 = $142;
   $144 = HEAP32[$143>>2]|0;
   $145 = ($141|0)==(-1);
   $146 = ($144|0)==(0);
   $147 = $145 & $146;
   if (!($147)) {
    $148 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $149 = HEAP32[$148>>2]|0;
    $150 = ((($149)) + 4|0);
    $151 = HEAP32[$150>>2]|0;
    $152 = $114;
    $153 = $152;
    $154 = HEAP32[$153>>2]|0;
    $155 = (($152) + 4)|0;
    $156 = $155;
    $157 = HEAP32[$156>>2]|0;
    FUNCTION_TABLE_viii[$151 & 0]($148,$154,$157);
   }
   $158 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $159 = HEAP32[$158>>2]|0;
   $160 = ((($159)) + 8|0);
   $161 = HEAP32[$160>>2]|0;
   FUNCTION_TABLE_vii[$161 & 0]($158,$112);
  }
  HEAP32[$lock>>2] = 0;
 }
 STACKTOP = sp;return;
}
function __ZN7DVectorI7Vector2E11unreferenceEv($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, $lock = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $lock = sp + 4|0;
 $0 = sp;
 $1 = HEAP32[136]|0;
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = HEAP32[$1>>2]|0;
  $4 = HEAP32[$3>>2]|0;
  FUNCTION_TABLE_vi[$4 & 15]($1);
 }
 $5 = HEAP32[$this>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = HEAP32[136]|0;
  $8 = ($7|0)==(0|0);
  if ($8) {
   STACKTOP = sp;return;
  }
  $9 = HEAP32[$7>>2]|0;
  $10 = ((($9)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  FUNCTION_TABLE_vi[$11 & 15]($7);
  STACKTOP = sp;return;
 }
 HEAP32[$lock>>2] = 0;
 $12 = HEAP32[$5>>2]|0;
 $13 = (($12) + 1)|0;
 HEAP32[$5>>2] = $13;
 HEAP32[$lock>>2] = $5;
 $14 = ((($5)) + 8|0);
 $15 = $14;
 $16 = $15;
 $17 = HEAP32[$16>>2]|0;
 $18 = (($15) + 4)|0;
 $19 = $18;
 $20 = HEAP32[$19>>2]|0;
 $21 = ($17|0)==(-1);
 $22 = ($20|0)==(0);
 $23 = $21 & $22;
 if (!($23)) {
  $24 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = ((($25)) + 24|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = $14;
  $29 = $28;
  $30 = HEAP32[$29>>2]|0;
  $31 = (($28) + 4)|0;
  $32 = $31;
  $33 = HEAP32[$32>>2]|0;
  (FUNCTION_TABLE_iiii[$27 & 15]($24,$30,$33)|0);
 }
 $34 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
 $35 = HEAP32[$34>>2]|0;
 $36 = ((($35)) + 28|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = ((($5)) + 8|0);
 $39 = $38;
 $40 = $39;
 $41 = HEAP32[$40>>2]|0;
 $42 = (($39) + 4)|0;
 $43 = $42;
 $44 = HEAP32[$43>>2]|0;
 $45 = (FUNCTION_TABLE_iiii[$37 & 15]($34,$41,$44)|0);
 $46 = HEAP32[$45>>2]|0;
 $47 = (($46) + -1)|0;
 HEAP32[$45>>2] = $47;
 $48 = ($47|0)==(0);
 if ($48) {
  $49 = HEAP32[$this>>2]|0;
  $50 = ($49|0)==(0|0);
  if (!($50)) {
   $51 = ((($49)) + 8|0);
   $52 = $51;
   $53 = $52;
   $54 = HEAP32[$53>>2]|0;
   $55 = (($52) + 4)|0;
   $56 = $55;
   $57 = HEAP32[$56>>2]|0;
   $58 = ($54|0)==(-1);
   $59 = ($57|0)==(0);
   $60 = $58 & $59;
   if (!($60)) {
    $61 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $62 = HEAP32[$61>>2]|0;
    $63 = ((($62)) + 16|0);
    $64 = HEAP32[$63>>2]|0;
    $65 = HEAP32[$this>>2]|0;
    $66 = ((($65)) + 8|0);
    $67 = $66;
    $68 = $67;
    $69 = HEAP32[$68>>2]|0;
    $70 = (($67) + 4)|0;
    $71 = $70;
    $72 = HEAP32[$71>>2]|0;
    (FUNCTION_TABLE_iiii[$64 & 15]($61,$69,$72)|0);
   }
  }
 }
 HEAP32[$0>>2] = 0;
 __ZN8MID_LockaSERKS_($lock,$0);
 $73 = HEAP32[$this>>2]|0;
 $74 = ($73|0)==(0|0);
 if (!($74)) {
  $75 = HEAP32[$73>>2]|0;
  $76 = ($75|0)>(0);
  if ($76) {
   $77 = (($75) + -1)|0;
   HEAP32[$73>>2] = $77;
   $78 = $77;
  } else {
   $78 = $75;
  }
  $79 = ($78|0)==(0);
  if ($79) {
   $80 = ((($73)) + 8|0);
   $81 = $80;
   $82 = $81;
   $83 = HEAP32[$82>>2]|0;
   $84 = (($81) + 4)|0;
   $85 = $84;
   $86 = HEAP32[$85>>2]|0;
   $87 = ($83|0)==(-1);
   $88 = ($86|0)==(0);
   $89 = $87 & $88;
   if (!($89)) {
    $90 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $91 = HEAP32[$90>>2]|0;
    $92 = ((($91)) + 4|0);
    $93 = HEAP32[$92>>2]|0;
    $94 = HEAP32[$this>>2]|0;
    $95 = ((($94)) + 8|0);
    $96 = $95;
    $97 = $96;
    $98 = HEAP32[$97>>2]|0;
    $99 = (($96) + 4)|0;
    $100 = $99;
    $101 = HEAP32[$100>>2]|0;
    FUNCTION_TABLE_viii[$93 & 0]($90,$98,$101);
   }
   $102 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $103 = HEAP32[$102>>2]|0;
   $104 = ((($103)) + 8|0);
   $105 = HEAP32[$104>>2]|0;
   $106 = HEAP32[$this>>2]|0;
   FUNCTION_TABLE_vii[$105 & 0]($102,$106);
  }
  HEAP32[$this>>2] = 0;
 }
 $107 = HEAP32[136]|0;
 $108 = ($107|0)==(0|0);
 if (!($108)) {
  $109 = HEAP32[$107>>2]|0;
  $110 = ((($109)) + 4|0);
  $111 = HEAP32[$110>>2]|0;
  FUNCTION_TABLE_vi[$111 & 15]($107);
 }
 $112 = HEAP32[$lock>>2]|0;
 $113 = ($112|0)==(0|0);
 if (!($113)) {
  $114 = ((($112)) + 8|0);
  $115 = $114;
  $116 = $115;
  $117 = HEAP32[$116>>2]|0;
  $118 = (($115) + 4)|0;
  $119 = $118;
  $120 = HEAP32[$119>>2]|0;
  $121 = ($117|0)==(-1);
  $122 = ($120|0)==(0);
  $123 = $121 & $122;
  if (!($123)) {
   $124 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
   $125 = HEAP32[$124>>2]|0;
   $126 = ((($125)) + 32|0);
   $127 = HEAP32[$126>>2]|0;
   $128 = $114;
   $129 = $128;
   $130 = HEAP32[$129>>2]|0;
   $131 = (($128) + 4)|0;
   $132 = $131;
   $133 = HEAP32[$132>>2]|0;
   (FUNCTION_TABLE_iiii[$127 & 15]($124,$130,$133)|0);
  }
  $134 = HEAP32[$112>>2]|0;
  $135 = ($134|0)>(0);
  if ($135) {
   $136 = (($134) + -1)|0;
   HEAP32[$112>>2] = $136;
   $137 = $136;
  } else {
   $137 = $134;
  }
  $138 = ($137|0)==(0);
  if ($138) {
   $139 = $114;
   $140 = $139;
   $141 = HEAP32[$140>>2]|0;
   $142 = (($139) + 4)|0;
   $143 = $142;
   $144 = HEAP32[$143>>2]|0;
   $145 = ($141|0)==(-1);
   $146 = ($144|0)==(0);
   $147 = $145 & $146;
   if (!($147)) {
    $148 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $149 = HEAP32[$148>>2]|0;
    $150 = ((($149)) + 4|0);
    $151 = HEAP32[$150>>2]|0;
    $152 = $114;
    $153 = $152;
    $154 = HEAP32[$153>>2]|0;
    $155 = (($152) + 4)|0;
    $156 = $155;
    $157 = HEAP32[$156>>2]|0;
    FUNCTION_TABLE_viii[$151 & 0]($148,$154,$157);
   }
   $158 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $159 = HEAP32[$158>>2]|0;
   $160 = ((($159)) + 8|0);
   $161 = HEAP32[$160>>2]|0;
   FUNCTION_TABLE_vii[$161 & 0]($158,$112);
  }
  HEAP32[$lock>>2] = 0;
 }
 STACKTOP = sp;return;
}
function __ZN7DVectorI7Vector3E11unreferenceEv($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, $lock = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $lock = sp + 4|0;
 $0 = sp;
 $1 = HEAP32[136]|0;
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = HEAP32[$1>>2]|0;
  $4 = HEAP32[$3>>2]|0;
  FUNCTION_TABLE_vi[$4 & 15]($1);
 }
 $5 = HEAP32[$this>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = HEAP32[136]|0;
  $8 = ($7|0)==(0|0);
  if ($8) {
   STACKTOP = sp;return;
  }
  $9 = HEAP32[$7>>2]|0;
  $10 = ((($9)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  FUNCTION_TABLE_vi[$11 & 15]($7);
  STACKTOP = sp;return;
 }
 HEAP32[$lock>>2] = 0;
 $12 = HEAP32[$5>>2]|0;
 $13 = (($12) + 1)|0;
 HEAP32[$5>>2] = $13;
 HEAP32[$lock>>2] = $5;
 $14 = ((($5)) + 8|0);
 $15 = $14;
 $16 = $15;
 $17 = HEAP32[$16>>2]|0;
 $18 = (($15) + 4)|0;
 $19 = $18;
 $20 = HEAP32[$19>>2]|0;
 $21 = ($17|0)==(-1);
 $22 = ($20|0)==(0);
 $23 = $21 & $22;
 if (!($23)) {
  $24 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = ((($25)) + 24|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = $14;
  $29 = $28;
  $30 = HEAP32[$29>>2]|0;
  $31 = (($28) + 4)|0;
  $32 = $31;
  $33 = HEAP32[$32>>2]|0;
  (FUNCTION_TABLE_iiii[$27 & 15]($24,$30,$33)|0);
 }
 $34 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
 $35 = HEAP32[$34>>2]|0;
 $36 = ((($35)) + 28|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = ((($5)) + 8|0);
 $39 = $38;
 $40 = $39;
 $41 = HEAP32[$40>>2]|0;
 $42 = (($39) + 4)|0;
 $43 = $42;
 $44 = HEAP32[$43>>2]|0;
 $45 = (FUNCTION_TABLE_iiii[$37 & 15]($34,$41,$44)|0);
 $46 = HEAP32[$45>>2]|0;
 $47 = (($46) + -1)|0;
 HEAP32[$45>>2] = $47;
 $48 = ($47|0)==(0);
 if ($48) {
  $49 = HEAP32[$this>>2]|0;
  $50 = ($49|0)==(0|0);
  if (!($50)) {
   $51 = ((($49)) + 8|0);
   $52 = $51;
   $53 = $52;
   $54 = HEAP32[$53>>2]|0;
   $55 = (($52) + 4)|0;
   $56 = $55;
   $57 = HEAP32[$56>>2]|0;
   $58 = ($54|0)==(-1);
   $59 = ($57|0)==(0);
   $60 = $58 & $59;
   if (!($60)) {
    $61 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $62 = HEAP32[$61>>2]|0;
    $63 = ((($62)) + 16|0);
    $64 = HEAP32[$63>>2]|0;
    $65 = HEAP32[$this>>2]|0;
    $66 = ((($65)) + 8|0);
    $67 = $66;
    $68 = $67;
    $69 = HEAP32[$68>>2]|0;
    $70 = (($67) + 4)|0;
    $71 = $70;
    $72 = HEAP32[$71>>2]|0;
    (FUNCTION_TABLE_iiii[$64 & 15]($61,$69,$72)|0);
   }
  }
 }
 HEAP32[$0>>2] = 0;
 __ZN8MID_LockaSERKS_($lock,$0);
 $73 = HEAP32[$this>>2]|0;
 $74 = ($73|0)==(0|0);
 if (!($74)) {
  $75 = HEAP32[$73>>2]|0;
  $76 = ($75|0)>(0);
  if ($76) {
   $77 = (($75) + -1)|0;
   HEAP32[$73>>2] = $77;
   $78 = $77;
  } else {
   $78 = $75;
  }
  $79 = ($78|0)==(0);
  if ($79) {
   $80 = ((($73)) + 8|0);
   $81 = $80;
   $82 = $81;
   $83 = HEAP32[$82>>2]|0;
   $84 = (($81) + 4)|0;
   $85 = $84;
   $86 = HEAP32[$85>>2]|0;
   $87 = ($83|0)==(-1);
   $88 = ($86|0)==(0);
   $89 = $87 & $88;
   if (!($89)) {
    $90 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $91 = HEAP32[$90>>2]|0;
    $92 = ((($91)) + 4|0);
    $93 = HEAP32[$92>>2]|0;
    $94 = HEAP32[$this>>2]|0;
    $95 = ((($94)) + 8|0);
    $96 = $95;
    $97 = $96;
    $98 = HEAP32[$97>>2]|0;
    $99 = (($96) + 4)|0;
    $100 = $99;
    $101 = HEAP32[$100>>2]|0;
    FUNCTION_TABLE_viii[$93 & 0]($90,$98,$101);
   }
   $102 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $103 = HEAP32[$102>>2]|0;
   $104 = ((($103)) + 8|0);
   $105 = HEAP32[$104>>2]|0;
   $106 = HEAP32[$this>>2]|0;
   FUNCTION_TABLE_vii[$105 & 0]($102,$106);
  }
  HEAP32[$this>>2] = 0;
 }
 $107 = HEAP32[136]|0;
 $108 = ($107|0)==(0|0);
 if (!($108)) {
  $109 = HEAP32[$107>>2]|0;
  $110 = ((($109)) + 4|0);
  $111 = HEAP32[$110>>2]|0;
  FUNCTION_TABLE_vi[$111 & 15]($107);
 }
 $112 = HEAP32[$lock>>2]|0;
 $113 = ($112|0)==(0|0);
 if (!($113)) {
  $114 = ((($112)) + 8|0);
  $115 = $114;
  $116 = $115;
  $117 = HEAP32[$116>>2]|0;
  $118 = (($115) + 4)|0;
  $119 = $118;
  $120 = HEAP32[$119>>2]|0;
  $121 = ($117|0)==(-1);
  $122 = ($120|0)==(0);
  $123 = $121 & $122;
  if (!($123)) {
   $124 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
   $125 = HEAP32[$124>>2]|0;
   $126 = ((($125)) + 32|0);
   $127 = HEAP32[$126>>2]|0;
   $128 = $114;
   $129 = $128;
   $130 = HEAP32[$129>>2]|0;
   $131 = (($128) + 4)|0;
   $132 = $131;
   $133 = HEAP32[$132>>2]|0;
   (FUNCTION_TABLE_iiii[$127 & 15]($124,$130,$133)|0);
  }
  $134 = HEAP32[$112>>2]|0;
  $135 = ($134|0)>(0);
  if ($135) {
   $136 = (($134) + -1)|0;
   HEAP32[$112>>2] = $136;
   $137 = $136;
  } else {
   $137 = $134;
  }
  $138 = ($137|0)==(0);
  if ($138) {
   $139 = $114;
   $140 = $139;
   $141 = HEAP32[$140>>2]|0;
   $142 = (($139) + 4)|0;
   $143 = $142;
   $144 = HEAP32[$143>>2]|0;
   $145 = ($141|0)==(-1);
   $146 = ($144|0)==(0);
   $147 = $145 & $146;
   if (!($147)) {
    $148 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $149 = HEAP32[$148>>2]|0;
    $150 = ((($149)) + 4|0);
    $151 = HEAP32[$150>>2]|0;
    $152 = $114;
    $153 = $152;
    $154 = HEAP32[$153>>2]|0;
    $155 = (($152) + 4)|0;
    $156 = $155;
    $157 = HEAP32[$156>>2]|0;
    FUNCTION_TABLE_viii[$151 & 0]($148,$154,$157);
   }
   $158 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $159 = HEAP32[$158>>2]|0;
   $160 = ((($159)) + 8|0);
   $161 = HEAP32[$160>>2]|0;
   FUNCTION_TABLE_vii[$161 & 0]($158,$112);
  }
  HEAP32[$lock>>2] = 0;
 }
 STACKTOP = sp;return;
}
function __ZN7DVectorI5ColorE11unreferenceEv($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0;
 var $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0;
 var $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0;
 var $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0;
 var $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0;
 var $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0, $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0;
 var $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0, $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0;
 var $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0, $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0;
 var $98 = 0, $99 = 0, $lock = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $lock = sp + 4|0;
 $0 = sp;
 $1 = HEAP32[136]|0;
 $2 = ($1|0)==(0|0);
 if (!($2)) {
  $3 = HEAP32[$1>>2]|0;
  $4 = HEAP32[$3>>2]|0;
  FUNCTION_TABLE_vi[$4 & 15]($1);
 }
 $5 = HEAP32[$this>>2]|0;
 $6 = ($5|0)==(0|0);
 if ($6) {
  $7 = HEAP32[136]|0;
  $8 = ($7|0)==(0|0);
  if ($8) {
   STACKTOP = sp;return;
  }
  $9 = HEAP32[$7>>2]|0;
  $10 = ((($9)) + 4|0);
  $11 = HEAP32[$10>>2]|0;
  FUNCTION_TABLE_vi[$11 & 15]($7);
  STACKTOP = sp;return;
 }
 HEAP32[$lock>>2] = 0;
 $12 = HEAP32[$5>>2]|0;
 $13 = (($12) + 1)|0;
 HEAP32[$5>>2] = $13;
 HEAP32[$lock>>2] = $5;
 $14 = ((($5)) + 8|0);
 $15 = $14;
 $16 = $15;
 $17 = HEAP32[$16>>2]|0;
 $18 = (($15) + 4)|0;
 $19 = $18;
 $20 = HEAP32[$19>>2]|0;
 $21 = ($17|0)==(-1);
 $22 = ($20|0)==(0);
 $23 = $21 & $22;
 if (!($23)) {
  $24 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
  $25 = HEAP32[$24>>2]|0;
  $26 = ((($25)) + 24|0);
  $27 = HEAP32[$26>>2]|0;
  $28 = $14;
  $29 = $28;
  $30 = HEAP32[$29>>2]|0;
  $31 = (($28) + 4)|0;
  $32 = $31;
  $33 = HEAP32[$32>>2]|0;
  (FUNCTION_TABLE_iiii[$27 & 15]($24,$30,$33)|0);
 }
 $34 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
 $35 = HEAP32[$34>>2]|0;
 $36 = ((($35)) + 28|0);
 $37 = HEAP32[$36>>2]|0;
 $38 = ((($5)) + 8|0);
 $39 = $38;
 $40 = $39;
 $41 = HEAP32[$40>>2]|0;
 $42 = (($39) + 4)|0;
 $43 = $42;
 $44 = HEAP32[$43>>2]|0;
 $45 = (FUNCTION_TABLE_iiii[$37 & 15]($34,$41,$44)|0);
 $46 = HEAP32[$45>>2]|0;
 $47 = (($46) + -1)|0;
 HEAP32[$45>>2] = $47;
 $48 = ($47|0)==(0);
 if ($48) {
  $49 = HEAP32[$this>>2]|0;
  $50 = ($49|0)==(0|0);
  if (!($50)) {
   $51 = ((($49)) + 8|0);
   $52 = $51;
   $53 = $52;
   $54 = HEAP32[$53>>2]|0;
   $55 = (($52) + 4)|0;
   $56 = $55;
   $57 = HEAP32[$56>>2]|0;
   $58 = ($54|0)==(-1);
   $59 = ($57|0)==(0);
   $60 = $58 & $59;
   if (!($60)) {
    $61 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $62 = HEAP32[$61>>2]|0;
    $63 = ((($62)) + 16|0);
    $64 = HEAP32[$63>>2]|0;
    $65 = HEAP32[$this>>2]|0;
    $66 = ((($65)) + 8|0);
    $67 = $66;
    $68 = $67;
    $69 = HEAP32[$68>>2]|0;
    $70 = (($67) + 4)|0;
    $71 = $70;
    $72 = HEAP32[$71>>2]|0;
    (FUNCTION_TABLE_iiii[$64 & 15]($61,$69,$72)|0);
   }
  }
 }
 HEAP32[$0>>2] = 0;
 __ZN8MID_LockaSERKS_($lock,$0);
 $73 = HEAP32[$this>>2]|0;
 $74 = ($73|0)==(0|0);
 if (!($74)) {
  $75 = HEAP32[$73>>2]|0;
  $76 = ($75|0)>(0);
  if ($76) {
   $77 = (($75) + -1)|0;
   HEAP32[$73>>2] = $77;
   $78 = $77;
  } else {
   $78 = $75;
  }
  $79 = ($78|0)==(0);
  if ($79) {
   $80 = ((($73)) + 8|0);
   $81 = $80;
   $82 = $81;
   $83 = HEAP32[$82>>2]|0;
   $84 = (($81) + 4)|0;
   $85 = $84;
   $86 = HEAP32[$85>>2]|0;
   $87 = ($83|0)==(-1);
   $88 = ($86|0)==(0);
   $89 = $87 & $88;
   if (!($89)) {
    $90 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $91 = HEAP32[$90>>2]|0;
    $92 = ((($91)) + 4|0);
    $93 = HEAP32[$92>>2]|0;
    $94 = HEAP32[$this>>2]|0;
    $95 = ((($94)) + 8|0);
    $96 = $95;
    $97 = $96;
    $98 = HEAP32[$97>>2]|0;
    $99 = (($96) + 4)|0;
    $100 = $99;
    $101 = HEAP32[$100>>2]|0;
    FUNCTION_TABLE_viii[$93 & 0]($90,$98,$101);
   }
   $102 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $103 = HEAP32[$102>>2]|0;
   $104 = ((($103)) + 8|0);
   $105 = HEAP32[$104>>2]|0;
   $106 = HEAP32[$this>>2]|0;
   FUNCTION_TABLE_vii[$105 & 0]($102,$106);
  }
  HEAP32[$this>>2] = 0;
 }
 $107 = HEAP32[136]|0;
 $108 = ($107|0)==(0|0);
 if (!($108)) {
  $109 = HEAP32[$107>>2]|0;
  $110 = ((($109)) + 4|0);
  $111 = HEAP32[$110>>2]|0;
  FUNCTION_TABLE_vi[$111 & 15]($107);
 }
 $112 = HEAP32[$lock>>2]|0;
 $113 = ($112|0)==(0|0);
 if (!($113)) {
  $114 = ((($112)) + 8|0);
  $115 = $114;
  $116 = $115;
  $117 = HEAP32[$116>>2]|0;
  $118 = (($115) + 4)|0;
  $119 = $118;
  $120 = HEAP32[$119>>2]|0;
  $121 = ($117|0)==(-1);
  $122 = ($120|0)==(0);
  $123 = $121 & $122;
  if (!($123)) {
   $124 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
   $125 = HEAP32[$124>>2]|0;
   $126 = ((($125)) + 32|0);
   $127 = HEAP32[$126>>2]|0;
   $128 = $114;
   $129 = $128;
   $130 = HEAP32[$129>>2]|0;
   $131 = (($128) + 4)|0;
   $132 = $131;
   $133 = HEAP32[$132>>2]|0;
   (FUNCTION_TABLE_iiii[$127 & 15]($124,$130,$133)|0);
  }
  $134 = HEAP32[$112>>2]|0;
  $135 = ($134|0)>(0);
  if ($135) {
   $136 = (($134) + -1)|0;
   HEAP32[$112>>2] = $136;
   $137 = $136;
  } else {
   $137 = $134;
  }
  $138 = ($137|0)==(0);
  if ($138) {
   $139 = $114;
   $140 = $139;
   $141 = HEAP32[$140>>2]|0;
   $142 = (($139) + 4)|0;
   $143 = $142;
   $144 = HEAP32[$143>>2]|0;
   $145 = ($141|0)==(-1);
   $146 = ($144|0)==(0);
   $147 = $145 & $146;
   if (!($147)) {
    $148 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
    $149 = HEAP32[$148>>2]|0;
    $150 = ((($149)) + 4|0);
    $151 = HEAP32[$150>>2]|0;
    $152 = $114;
    $153 = $152;
    $154 = HEAP32[$153>>2]|0;
    $155 = (($152) + 4)|0;
    $156 = $155;
    $157 = HEAP32[$156>>2]|0;
    FUNCTION_TABLE_viii[$151 & 0]($148,$154,$157);
   }
   $158 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
   $159 = HEAP32[$158>>2]|0;
   $160 = ((($159)) + 8|0);
   $161 = HEAP32[$160>>2]|0;
   FUNCTION_TABLE_vii[$161 & 0]($158,$112);
  }
  HEAP32[$lock>>2] = 0;
 }
 STACKTOP = sp;return;
}
function __ZN6RefPtr5unrefEv($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 if (!($1)) {
  $2 = (__ZN9Reference11unreferenceEv($0)|0);
  if ($2) {
   $3 = HEAP32[$this>>2]|0;
   $4 = (__Z17predelete_handlerP6Object($3)|0);
   if ($4) {
    $5 = HEAP32[$3>>2]|0;
    $6 = ((($5)) + 76|0);
    $7 = HEAP32[$6>>2]|0;
    FUNCTION_TABLE_vi[$7 & 15]($3);
    __ZN6Memory11free_staticEPv($3);
   }
  }
 }
 HEAP32[$this>>2] = 0;
 return;
}
function __GLOBAL__sub_I_object_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAP32[137] = 0;
 HEAP32[(556)>>2] = 0;
 HEAP8[(552)>>0] = 0;
 (___cxa_atexit((7|0),(548|0),(___dso_handle|0))|0);
 HEAP32[140] = 0;
 HEAP32[(568)>>2] = 0;
 HEAP8[(564)>>0] = 0;
 (___cxa_atexit((8|0),(560|0),(___dso_handle|0))|0);
 return;
}
function __ZN7HashMapIjP6Object20HashMapHahserDefaultLh3ELh8EED2Ev($this) {
 $this = $this|0;
 var $$lcssa = 0, $$pre$i = 0, $$pre5$i = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$02$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 $$pre5$i = ((($this)) + 4|0);
 if ($1) {
  HEAP32[$this>>2] = 0;
  HEAP8[$$pre5$i>>0] = 0;
  $23 = ((($this)) + 8|0);
  HEAP32[$23>>2] = 0;
  return;
 }
 $2 = HEAP8[$$pre5$i>>0]|0;
 $3 = ($2<<24>>24)==(31);
 if ($3) {
  $9 = $0;
 } else {
  $24 = $2;$5 = $0;$i$02$i = 0;
  while(1) {
   $4 = (($5) + ($i$02$i<<2)|0);
   $6 = HEAP32[$4>>2]|0;
   $7 = ($6|0)==(0|0);
   if ($7) {
    $20 = $24;$25 = $5;
   } else {
    $11 = $6;$13 = $4;
    while(1) {
     $10 = ((($11)) + 4|0);
     $12 = HEAP32[$10>>2]|0;
     HEAP32[$13>>2] = $12;
     __ZN6Memory11free_staticEPv($11);
     $14 = HEAP32[$this>>2]|0;
     $15 = (($14) + ($i$02$i<<2)|0);
     $16 = HEAP32[$15>>2]|0;
     $17 = ($16|0)==(0|0);
     if ($17) {
      $$lcssa = $14;
      break;
     } else {
      $11 = $16;$13 = $15;
     }
    }
    $$pre$i = HEAP8[$$pre5$i>>0]|0;
    $20 = $$pre$i;$25 = $$lcssa;
   }
   $18 = (($i$02$i) + 1)|0;
   $19 = $20&255;
   $21 = 1 << $19;
   $22 = ($18|0)<($21|0);
   if ($22) {
    $24 = $20;$5 = $25;$i$02$i = $18;
   } else {
    $9 = $25;
    break;
   }
  }
 }
 $8 = ((($9)) + -4|0);
 __ZN6Memory11free_staticEPv($8);
 HEAP32[$this>>2] = 0;
 HEAP8[$$pre5$i>>0] = 0;
 $23 = ((($this)) + 8|0);
 HEAP32[$23>>2] = 0;
 return;
}
function __ZN7HashMapIP6ObjectjN8ObjectDB13ObjectPtrHashELh3ELh8EED2Ev($this) {
 $this = $this|0;
 var $$lcssa = 0, $$pre$i = 0, $$pre5$i = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$02$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 $$pre5$i = ((($this)) + 4|0);
 if ($1) {
  HEAP32[$this>>2] = 0;
  HEAP8[$$pre5$i>>0] = 0;
  $23 = ((($this)) + 8|0);
  HEAP32[$23>>2] = 0;
  return;
 }
 $2 = HEAP8[$$pre5$i>>0]|0;
 $3 = ($2<<24>>24)==(31);
 if ($3) {
  $9 = $0;
 } else {
  $24 = $2;$5 = $0;$i$02$i = 0;
  while(1) {
   $4 = (($5) + ($i$02$i<<2)|0);
   $6 = HEAP32[$4>>2]|0;
   $7 = ($6|0)==(0|0);
   if ($7) {
    $20 = $24;$25 = $5;
   } else {
    $11 = $6;$13 = $4;
    while(1) {
     $10 = ((($11)) + 4|0);
     $12 = HEAP32[$10>>2]|0;
     HEAP32[$13>>2] = $12;
     __ZN6Memory11free_staticEPv($11);
     $14 = HEAP32[$this>>2]|0;
     $15 = (($14) + ($i$02$i<<2)|0);
     $16 = HEAP32[$15>>2]|0;
     $17 = ($16|0)==(0|0);
     if ($17) {
      $$lcssa = $14;
      break;
     } else {
      $11 = $16;$13 = $15;
     }
    }
    $$pre$i = HEAP8[$$pre5$i>>0]|0;
    $20 = $$pre$i;$25 = $$lcssa;
   }
   $18 = (($i$02$i) + 1)|0;
   $19 = $20&255;
   $21 = 1 << $19;
   $22 = ($18|0)<($21|0);
   if ($22) {
    $24 = $20;$5 = $25;$i$02$i = $18;
   } else {
    $9 = $25;
    break;
   }
  }
 }
 $8 = ((($9)) + -4|0);
 __ZN6Memory11free_staticEPv($8);
 HEAP32[$this>>2] = 0;
 HEAP8[$$pre5$i>>0] = 0;
 $23 = ((($this)) + 8|0);
 HEAP32[$23>>2] = 0;
 return;
}
function __Z17predelete_handlerP6Object($p_object) {
 $p_object = $p_object|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($p_object)) + 28|0);
 HEAP32[$0>>2] = 1;
 $1 = HEAP32[$p_object>>2]|0;
 $2 = ((($1)) + 20|0);
 $3 = HEAP32[$2>>2]|0;
 FUNCTION_TABLE_viii[$3 & 0]($p_object,1,1);
 $4 = ((($p_object)) + 52|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = ($5|0)==(0|0);
 if (!($6)) {
  $7 = HEAP32[$5>>2]|0;
  $8 = ((($7)) + 48|0);
  $9 = HEAP32[$8>>2]|0;
  FUNCTION_TABLE_vii[$9 & 0]($5,1);
 }
 $10 = HEAP32[$0>>2]|0;
 $11 = ($10|0)==(0);
 if ($11) {
  $13 = ($10|0)!=(0);
  return ($13|0);
 }
 $12 = ((($p_object)) + 68|0);
 HEAP32[$12>>2] = 0;
 $13 = ($10|0)!=(0);
 return ($13|0);
}
function __ZN10StringName5unrefEv($this) {
 $this = $this|0;
 var $$phi$trans$insert = 0, $$pre = 0, $$pre1 = 0, $$pre2 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0;
 var $41 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP8[18384]|0;
 $1 = ($0<<24>>24)==(0);
 if ($1) {
  __Z16_err_print_errorPKcS0_iS0_16ErrorHandlerType(342,288,86,307,0);
  return;
 }
 HEAP8[18385] = 0;
 $2 = HEAP32[$this>>2]|0;
 $3 = ($2|0)==(0|0);
 if (!($3)) {
  $4 = HEAP32[$2>>2]|0;
  $5 = ($4|0)>(0);
  if ($5) {
   $6 = (($4) + -1)|0;
   HEAP32[$2>>2] = $6;
   $7 = $6;
  } else {
   $7 = $4;
  }
  $8 = ($7|0)==(0);
  if ($8) {
   __Z12_global_lockv();
   $9 = HEAP32[$this>>2]|0;
   $10 = ((($9)) + 20|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)==(0|0);
   if ($12) {
    $16 = ((($9)) + 12|0);
    $17 = HEAP32[$16>>2]|0;
    $18 = (572 + ($17<<2)|0);
    $19 = HEAP32[$18>>2]|0;
    $20 = ($19|0)==($9|0);
    if ($20) {
     $22 = $9;$25 = $17;
    } else {
     __Z16_err_print_errorPKcS0_iS0_16ErrorHandlerType(342,288,96,348,0);
     HEAP8[18385] = 0;
     $$pre = HEAP32[$this>>2]|0;
     $$phi$trans$insert = ((($$pre)) + 12|0);
     $$pre1 = HEAP32[$$phi$trans$insert>>2]|0;
     $22 = $$pre;$25 = $$pre1;
    }
    $21 = ((($22)) + 24|0);
    $23 = HEAP32[$21>>2]|0;
    $24 = (572 + ($25<<2)|0);
    HEAP32[$24>>2] = $23;
    $$pre2 = HEAP32[$this>>2]|0;
    $27 = $$pre2;
   } else {
    $13 = ((($9)) + 24|0);
    $14 = HEAP32[$13>>2]|0;
    $15 = ((($11)) + 24|0);
    HEAP32[$15>>2] = $14;
    $27 = $9;
   }
   $26 = ((($27)) + 24|0);
   $28 = HEAP32[$26>>2]|0;
   $29 = ($28|0)==(0|0);
   if (!($29)) {
    $30 = ((($27)) + 20|0);
    $31 = HEAP32[$30>>2]|0;
    $32 = ((($28)) + 20|0);
    HEAP32[$32>>2] = $31;
   }
   $33 = ((($27)) + 8|0);
   $34 = HEAP32[$33>>2]|0;
   $35 = ($34|0)==(0|0);
   if (!($35)) {
    $36 = ((($34)) + -8|0);
    $37 = HEAP32[$36>>2]|0;
    $38 = ($37|0)>(0);
    if ($38) {
     $39 = (($37) + -1)|0;
     HEAP32[$36>>2] = $39;
     $40 = $39;
    } else {
     $40 = $37;
    }
    $41 = ($40|0)==(0);
    if ($41) {
     __ZN6Memory11free_staticEPv($36);
    }
   }
   __ZN6Memory11free_staticEPv($27);
   __Z14_global_unlockv();
  }
 }
 HEAP32[$this>>2] = 0;
 return;
}
function __ZN10StringNameD2Ev($this) {
 $this = $this|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 __ZN10StringName5unrefEv($this);
 return;
}
function __ZN5ImageD2Ev($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($this)) + 4|0);
 __ZN7DVectorIhE11unreferenceEv($0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0|0);
 if ($2) {
  return;
 }
 $3 = HEAP32[$1>>2]|0;
 $4 = ($3|0)>(0);
 if ($4) {
  $5 = (($3) + -1)|0;
  HEAP32[$1>>2] = $5;
  $6 = $5;
 } else {
  $6 = $3;
 }
 $7 = ($6|0)==(0);
 if ($7) {
  $8 = ((($1)) + 8|0);
  $9 = $8;
  $10 = $9;
  $11 = HEAP32[$10>>2]|0;
  $12 = (($9) + 4)|0;
  $13 = $12;
  $14 = HEAP32[$13>>2]|0;
  $15 = ($11|0)==(-1);
  $16 = ($14|0)==(0);
  $17 = $15 & $16;
  if (!($17)) {
   $18 = (__ZN17MemoryPoolDynamic13get_singletonEv()|0);
   $19 = HEAP32[$18>>2]|0;
   $20 = ((($19)) + 4|0);
   $21 = HEAP32[$20>>2]|0;
   $22 = HEAP32[$0>>2]|0;
   $23 = ((($22)) + 8|0);
   $24 = $23;
   $25 = $24;
   $26 = HEAP32[$25>>2]|0;
   $27 = (($24) + 4)|0;
   $28 = $27;
   $29 = HEAP32[$28>>2]|0;
   FUNCTION_TABLE_viii[$21 & 0]($18,$26,$29);
  }
  $30 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
  $31 = HEAP32[$30>>2]|0;
  $32 = ((($31)) + 8|0);
  $33 = HEAP32[$32>>2]|0;
  $34 = HEAP32[$0>>2]|0;
  FUNCTION_TABLE_vii[$33 & 0]($30,$34);
 }
 HEAP32[$0>>2] = 0;
 return;
}
function __Z16_err_print_errorPKcS0_iS0_16ErrorHandlerType($p_function,$p_file,$p_line,$p_error,$p_type) {
 $p_function = $p_function|0;
 $p_file = $p_file|0;
 $p_line = $p_line|0;
 $p_error = $p_error|0;
 $p_type = $p_type|0;
 var $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0, $26 = 0;
 var $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $l$0 = 0, $l$01 = 0, $l$02 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN2OS13get_singletonEv()|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($1)) + 48|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = HEAP8[18385]|0;
 $5 = ($4<<24>>24)==(0);
 if ($5) {
  $11 = 18386;
 } else {
  $6 = (__ZN2OS13get_singletonEv()|0);
  $7 = HEAP32[$6>>2]|0;
  $8 = ((($7)) + 76|0);
  $9 = HEAP32[$8>>2]|0;
  $10 = (FUNCTION_TABLE_ii[$9 & 1]($6)|0);
  $11 = $10;
 }
 FUNCTION_TABLE_viiiiiii[$3 & 0]($0,$p_function,$p_file,$p_line,$p_error,$11,$p_type);
 __Z12_global_lockv();
 $l$01 = HEAP32[4239]|0;
 $12 = ($l$01|0)==(0|0);
 if (!($12)) {
  $l$02 = $l$01;
  while(1) {
   $13 = HEAP32[$l$02>>2]|0;
   $14 = ((($l$02)) + 4|0);
   $15 = HEAP32[$14>>2]|0;
   $16 = HEAP8[18385]|0;
   $17 = ($16<<24>>24)==(0);
   if ($17) {
    $23 = 18386;
   } else {
    $18 = (__ZN2OS13get_singletonEv()|0);
    $19 = HEAP32[$18>>2]|0;
    $20 = ((($19)) + 76|0);
    $21 = HEAP32[$20>>2]|0;
    $22 = (FUNCTION_TABLE_ii[$21 & 1]($18)|0);
    $23 = $22;
   }
   FUNCTION_TABLE_viiiiiii[$13 & 0]($15,$p_function,$p_file,$p_line,$p_error,$23,$p_type);
   $24 = ((($l$02)) + 8|0);
   $l$0 = HEAP32[$24>>2]|0;
   $25 = ($l$0|0)==(0|0);
   if ($25) {
    break;
   } else {
    $l$02 = $l$0;
   }
  }
 }
 __Z14_global_unlockv();
 $26 = HEAP8[18385]|0;
 $27 = ($26<<24>>24)==(0);
 if ($27) {
  return;
 }
 $28 = (__ZN2OS13get_singletonEv()|0);
 $29 = HEAP32[$28>>2]|0;
 $30 = ((($29)) + 80|0);
 $31 = HEAP32[$30>>2]|0;
 FUNCTION_TABLE_vi[$31 & 15]($28);
 HEAP8[18385] = 0;
 return;
}
function __ZN7HashMapI7VariantS0_22_DictionaryVariantHashLh3ELh8EE5clearEv($this) {
 $this = $this|0;
 var $$lcssa = 0, $$pre = 0, $$pre5 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$02 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 $$pre5 = ((($this)) + 4|0);
 if ($1) {
  HEAP32[$this>>2] = 0;
  HEAP8[$$pre5>>0] = 0;
  $29 = ((($this)) + 8|0);
  HEAP32[$29>>2] = 0;
  return;
 }
 $2 = HEAP8[$$pre5>>0]|0;
 $3 = ($2<<24>>24)==(31);
 if ($3) {
  $9 = $0;
 } else {
  $30 = $2;$5 = $0;$i$02 = 0;
  while(1) {
   $4 = (($5) + ($i$02<<2)|0);
   $6 = HEAP32[$4>>2]|0;
   $7 = ($6|0)==(0|0);
   if ($7) {
    $26 = $30;$31 = $5;
   } else {
    $11 = $6;$13 = $4;
    while(1) {
     $10 = ((($11)) + 4|0);
     $12 = HEAP32[$10>>2]|0;
     HEAP32[$13>>2] = $12;
     $14 = ((($11)) + 8|0);
     $15 = ((($11)) + 32|0);
     $16 = HEAP32[$15>>2]|0;
     $17 = ($16|0)==(0);
     if (!($17)) {
      __ZN7Variant5clearEv($15);
     }
     $18 = HEAP32[$14>>2]|0;
     $19 = ($18|0)==(0);
     if (!($19)) {
      __ZN7Variant5clearEv($14);
     }
     __ZN6Memory11free_staticEPv($11);
     $20 = HEAP32[$this>>2]|0;
     $21 = (($20) + ($i$02<<2)|0);
     $22 = HEAP32[$21>>2]|0;
     $23 = ($22|0)==(0|0);
     if ($23) {
      $$lcssa = $20;
      break;
     } else {
      $11 = $22;$13 = $21;
     }
    }
    $$pre = HEAP8[$$pre5>>0]|0;
    $26 = $$pre;$31 = $$lcssa;
   }
   $24 = (($i$02) + 1)|0;
   $25 = $26&255;
   $27 = 1 << $25;
   $28 = ($24|0)<($27|0);
   if ($28) {
    $30 = $26;$5 = $31;$i$02 = $24;
   } else {
    $9 = $31;
    break;
   }
  }
 }
 $8 = ((($9)) + -4|0);
 __ZN6Memory11free_staticEPv($8);
 HEAP32[$this>>2] = 0;
 HEAP8[$$pre5>>0] = 0;
 $29 = ((($this)) + 8|0);
 HEAP32[$29>>2] = 0;
 return;
}
function __ZN10DictionaryD2Ev($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  __Z16_err_print_errorPKcS0_iS0_16ErrorHandlerType(353,360,154,380,0);
  return;
 }
 HEAP8[18385] = 0;
 $2 = HEAP32[$0>>2]|0;
 $3 = ($2|0)>(0);
 if ($3) {
  $4 = (($2) + -1)|0;
  HEAP32[$0>>2] = $4;
  $5 = $4;
 } else {
  $5 = $2;
 }
 $6 = ($5|0)==(0);
 if ($6) {
  $7 = ((($0)) + 4|0);
  __ZN7HashMapI7VariantS0_22_DictionaryVariantHashLh3ELh8EE5clearEv($7);
  __ZN6Memory11free_staticEPv($0);
 }
 HEAP32[$this>>2] = 0;
 return;
}
function __ZN5ArrayD2Ev($this) {
 $this = $this|0;
 var $$pre$i$i$i$i$i = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0, $24 = 0, $25 = 0;
 var $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $i$01$i$i$i$i$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[$this>>2]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = HEAP32[$0>>2]|0;
 $3 = ($2|0)>(0);
 if ($3) {
  $4 = (($2) + -1)|0;
  HEAP32[$0>>2] = $4;
  $5 = $4;
 } else {
  $5 = $2;
 }
 $6 = ($5|0)==(0);
 if ($6) {
  $7 = ((($0)) + 4|0);
  $8 = HEAP32[$7>>2]|0;
  $9 = ($8|0)==(0|0);
  if (!($9)) {
   $10 = ((($8)) + -8|0);
   $11 = HEAP32[$10>>2]|0;
   $12 = ($11|0)>(0);
   if ($12) {
    $13 = (($11) + -1)|0;
    HEAP32[$10>>2] = $13;
    $14 = $13;
   } else {
    $14 = $11;
   }
   $15 = ($14|0)==(0);
   if ($15) {
    $16 = ((($8)) + -4|0);
    $17 = HEAP32[$16>>2]|0;
    $18 = ($17|0)>(0);
    if ($18) {
     $25 = $17;$i$01$i$i$i$i$i = 0;
     while(1) {
      $19 = (($8) + (($i$01$i$i$i$i$i*24)|0)|0);
      $20 = HEAP32[$19>>2]|0;
      $21 = ($20|0)==(0);
      if ($21) {
       $24 = $25;
      } else {
       __ZN7Variant5clearEv($19);
       $$pre$i$i$i$i$i = HEAP32[$16>>2]|0;
       $24 = $$pre$i$i$i$i$i;
      }
      $22 = (($i$01$i$i$i$i$i) + 1)|0;
      $23 = ($22|0)<($24|0);
      if ($23) {
       $25 = $24;$i$01$i$i$i$i$i = $22;
      } else {
       break;
      }
     }
    }
    __ZN6Memory11free_staticEPv($10);
   }
  }
  __ZN6Memory11free_staticEPv($0);
 }
 HEAP32[$this>>2] = 0;
 return;
}
function __ZN9Reference11unreferenceEv($this) {
 $this = $this|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($this)) + 80|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)>(0);
 if ($2) {
  $3 = (($1) + -1)|0;
  HEAP32[$0>>2] = $3;
  $4 = $3;
 } else {
  $4 = $1;
 }
 $5 = ($4|0)==(0);
 return ($5|0);
}
function __ZN2OS13get_singletonEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[4240]|0;
 return ($0|0);
}
function __ZN17MemoryPoolDynamic13get_singletonEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[4241]|0;
 return ($0|0);
}
function __Z12_global_lockv() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[4242]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = HEAP32[$0>>2]|0;
 $3 = HEAP32[$2>>2]|0;
 FUNCTION_TABLE_vi[$3 & 15]($0);
 return;
}
function __Z14_global_unlockv() {
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[4242]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  return;
 }
 $2 = HEAP32[$0>>2]|0;
 $3 = ((($2)) + 4|0);
 $4 = HEAP32[$3>>2]|0;
 FUNCTION_TABLE_vi[$4 & 15]($0);
 return;
}
function __ZN16MemoryPoolStatic13get_singletonEv() {
 var $0 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[4243]|0;
 return ($0|0);
}
function __ZN6Memory11free_staticEPv($p_ptr) {
 $p_ptr = $p_ptr|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
 $1 = ($0|0)==(0|0);
 if ($1) {
  __Z16_err_print_errorPKcS0_iS0_16ErrorHandlerType(426,407,58,438,0);
  return;
 } else {
  HEAP8[18385] = 0;
  $2 = (__ZN16MemoryPoolStatic13get_singletonEv()|0);
  $3 = HEAP32[$2>>2]|0;
  $4 = ((($3)) + 8|0);
  $5 = HEAP32[$4>>2]|0;
  FUNCTION_TABLE_vii[$5 & 0]($2,$p_ptr);
  return;
 }
}
function __GLOBAL__sub_I_matrix3_cpp() {
 var label = 0, sp = 0;
 sp = STACKTOP;
 HEAPF32[4244] = 1.0;
 HEAPF32[(16980)>>2] = 0.0;
 HEAPF32[(16984)>>2] = 0.0;
 HEAPF32[(16988)>>2] = 0.0;
 HEAPF32[(16992)>>2] = 1.0;
 HEAPF32[(16996)>>2] = 0.0;
 HEAPF32[(17000)>>2] = 0.0;
 HEAPF32[(17004)>>2] = 0.0;
 HEAPF32[(17008)>>2] = 1.0;
 HEAPF32[(17012)>>2] = 0.0;
 HEAPF32[(17016)>>2] = -1.0;
 HEAPF32[(17020)>>2] = 0.0;
 HEAPF32[(17024)>>2] = 1.0;
 ;HEAP32[(17028)>>2]=0|0;HEAP32[(17028)+4>>2]=0|0;HEAP32[(17028)+8>>2]=0|0;HEAP32[(17028)+12>>2]=0|0;
 HEAPF32[(17044)>>2] = 1.0;
 HEAPF32[(17048)>>2] = -1.0;
 HEAPF32[(17052)>>2] = 0.0;
 HEAPF32[(17056)>>2] = 0.0;
 HEAPF32[(17060)>>2] = 0.0;
 HEAPF32[(17064)>>2] = -1.0;
 HEAPF32[(17068)>>2] = 0.0;
 HEAPF32[(17072)>>2] = 0.0;
 HEAPF32[(17076)>>2] = 0.0;
 HEAPF32[(17080)>>2] = 1.0;
 HEAPF32[(17084)>>2] = 0.0;
 HEAPF32[(17088)>>2] = 1.0;
 HEAPF32[(17092)>>2] = 0.0;
 HEAPF32[(17096)>>2] = -1.0;
 ;HEAP32[(17100)>>2]=0|0;HEAP32[(17100)+4>>2]=0|0;HEAP32[(17100)+8>>2]=0|0;HEAP32[(17100)+12>>2]=0|0;
 HEAPF32[(17116)>>2] = 1.0;
 HEAPF32[(17120)>>2] = 1.0;
 ;HEAP32[(17124)>>2]=0|0;HEAP32[(17124)+4>>2]=0|0;HEAP32[(17124)+8>>2]=0|0;HEAP32[(17124)+12>>2]=0|0;
 HEAPF32[(17140)>>2] = -1.0;
 HEAPF32[(17144)>>2] = 0.0;
 HEAPF32[(17148)>>2] = 1.0;
 HEAPF32[(17152)>>2] = 0.0;
 HEAPF32[(17156)>>2] = 0.0;
 HEAPF32[(17160)>>2] = 0.0;
 HEAPF32[(17164)>>2] = 1.0;
 HEAPF32[(17168)>>2] = 1.0;
 HEAPF32[(17172)>>2] = 0.0;
 HEAPF32[(17176)>>2] = 0.0;
 HEAPF32[(17180)>>2] = 0.0;
 HEAPF32[(17184)>>2] = 1.0;
 HEAPF32[(17188)>>2] = 0.0;
 HEAPF32[(17192)>>2] = -1.0;
 ;HEAP32[(17196)>>2]=0|0;HEAP32[(17196)+4>>2]=0|0;HEAP32[(17196)+8>>2]=0|0;HEAP32[(17196)+12>>2]=0|0;
 HEAPF32[(17212)>>2] = 1.0;
 HEAPF32[(17216)>>2] = 0.0;
 HEAPF32[(17220)>>2] = 1.0;
 HEAPF32[(17224)>>2] = 0.0;
 HEAPF32[(17228)>>2] = 0.0;
 HEAPF32[(17232)>>2] = 0.0;
 HEAPF32[(17236)>>2] = -1.0;
 HEAPF32[(17240)>>2] = -1.0;
 HEAPF32[(17244)>>2] = 0.0;
 HEAPF32[(17248)>>2] = 0.0;
 HEAPF32[(17252)>>2] = 0.0;
 HEAPF32[(17256)>>2] = 1.0;
 HEAPF32[(17260)>>2] = 0.0;
 HEAPF32[(17264)>>2] = 1.0;
 HEAPF32[(17268)>>2] = 0.0;
 HEAPF32[(17272)>>2] = 0.0;
 HEAPF32[(17276)>>2] = 0.0;
 HEAPF32[(17280)>>2] = -1.0;
 HEAPF32[(17284)>>2] = 0.0;
 HEAPF32[(17288)>>2] = 0.0;
 HEAPF32[(17292)>>2] = 0.0;
 HEAPF32[(17296)>>2] = -1.0;
 HEAPF32[(17300)>>2] = 0.0;
 HEAPF32[(17304)>>2] = 1.0;
 HEAPF32[(17308)>>2] = 0.0;
 HEAPF32[(17312)>>2] = 1.0;
 ;HEAP32[(17316)>>2]=0|0;HEAP32[(17316)+4>>2]=0|0;HEAP32[(17316)+8>>2]=0|0;HEAP32[(17316)+12>>2]=0|0;
 HEAPF32[(17332)>>2] = -1.0;
 HEAPF32[(17336)>>2] = -1.0;
 HEAPF32[(17340)>>2] = 0.0;
 HEAPF32[(17344)>>2] = 0.0;
 HEAPF32[(17348)>>2] = 0.0;
 HEAPF32[(17352)>>2] = 1.0;
 HEAPF32[(17356)>>2] = 0.0;
 HEAPF32[(17360)>>2] = 0.0;
 HEAPF32[(17364)>>2] = 0.0;
 HEAPF32[(17368)>>2] = -1.0;
 HEAPF32[(17372)>>2] = 0.0;
 HEAPF32[(17376)>>2] = -1.0;
 HEAPF32[(17380)>>2] = 0.0;
 HEAPF32[(17384)>>2] = -1.0;
 ;HEAP32[(17388)>>2]=0|0;HEAP32[(17388)+4>>2]=0|0;HEAP32[(17388)+8>>2]=0|0;HEAP32[(17388)+12>>2]=0|0;
 HEAPF32[(17404)>>2] = -1.0;
 HEAPF32[(17408)>>2] = 1.0;
 ;HEAP32[(17412)>>2]=0|0;HEAP32[(17412)+4>>2]=0|0;HEAP32[(17412)+8>>2]=0|0;HEAP32[(17412)+12>>2]=0|0;
 HEAPF32[(17428)>>2] = 1.0;
 HEAPF32[(17432)>>2] = 0.0;
 HEAPF32[(17436)>>2] = -1.0;
 HEAPF32[(17440)>>2] = 0.0;
 HEAPF32[(17444)>>2] = 0.0;
 HEAPF32[(17448)>>2] = 0.0;
 HEAPF32[(17452)>>2] = -1.0;
 HEAPF32[(17456)>>2] = 1.0;
 HEAPF32[(17460)>>2] = 0.0;
 HEAPF32[(17464)>>2] = 0.0;
 HEAPF32[(17468)>>2] = 0.0;
 HEAPF32[(17472)>>2] = -1.0;
 HEAPF32[(17476)>>2] = 0.0;
 HEAPF32[(17480)>>2] = -1.0;
 ;HEAP32[(17484)>>2]=0|0;HEAP32[(17484)+4>>2]=0|0;HEAP32[(17484)+8>>2]=0|0;HEAP32[(17484)+12>>2]=0|0;
 HEAPF32[(17500)>>2] = -1.0;
 HEAPF32[(17504)>>2] = 0.0;
 HEAPF32[(17508)>>2] = -1.0;
 HEAPF32[(17512)>>2] = 0.0;
 HEAPF32[(17516)>>2] = 0.0;
 HEAPF32[(17520)>>2] = 0.0;
 HEAPF32[(17524)>>2] = 1.0;
 HEAPF32[(17528)>>2] = -1.0;
 HEAPF32[(17532)>>2] = 0.0;
 HEAPF32[(17536)>>2] = 0.0;
 HEAPF32[(17540)>>2] = 0.0;
 HEAPF32[(17544)>>2] = -1.0;
 HEAPF32[(17548)>>2] = 0.0;
 HEAPF32[(17552)>>2] = 0.0;
 HEAPF32[(17556)>>2] = 0.0;
 HEAPF32[(17560)>>2] = 1.0;
 HEAPF32[(17564)>>2] = 0.0;
 HEAPF32[(17568)>>2] = 1.0;
 HEAPF32[(17572)>>2] = 0.0;
 HEAPF32[(17576)>>2] = -1.0;
 HEAPF32[(17580)>>2] = 0.0;
 HEAPF32[(17584)>>2] = 0.0;
 HEAPF32[(17588)>>2] = 0.0;
 HEAPF32[(17592)>>2] = -1.0;
 HEAPF32[(17596)>>2] = 0.0;
 HEAPF32[(17600)>>2] = 0.0;
 HEAPF32[(17604)>>2] = 0.0;
 HEAPF32[(17608)>>2] = 1.0;
 HEAPF32[(17612)>>2] = -1.0;
 ;HEAP32[(17616)>>2]=0|0;HEAP32[(17616)+4>>2]=0|0;HEAP32[(17616)+8>>2]=0|0;HEAP32[(17616)+12>>2]=0|0;
 HEAPF32[(17632)>>2] = -1.0;
 HEAPF32[(17636)>>2] = 0.0;
 HEAPF32[(17640)>>2] = -1.0;
 HEAPF32[(17644)>>2] = 0.0;
 HEAPF32[(17648)>>2] = -1.0;
 HEAPF32[(17652)>>2] = 0.0;
 HEAPF32[(17656)>>2] = 0.0;
 HEAPF32[(17660)>>2] = 0.0;
 HEAPF32[(17664)>>2] = 1.0;
 HEAPF32[(17668)>>2] = 0.0;
 HEAPF32[(17672)>>2] = 0.0;
 HEAPF32[(17676)>>2] = 0.0;
 HEAPF32[(17680)>>2] = -1.0;
 HEAPF32[(17684)>>2] = -1.0;
 ;HEAP32[(17688)>>2]=0|0;HEAP32[(17688)+4>>2]=0|0;HEAP32[(17688)+8>>2]=0|0;HEAP32[(17688)+12>>2]=0|0;
 HEAPF32[(17704)>>2] = 1.0;
 HEAPF32[(17708)>>2] = 0.0;
 HEAPF32[(17712)>>2] = -1.0;
 HEAPF32[(17716)>>2] = 0.0;
 HEAPF32[(17720)>>2] = 1.0;
 HEAPF32[(17724)>>2] = 0.0;
 HEAPF32[(17728)>>2] = 0.0;
 HEAPF32[(17732)>>2] = 0.0;
 HEAPF32[(17736)>>2] = 1.0;
 HEAPF32[(17740)>>2] = 0.0;
 HEAPF32[(17744)>>2] = 0.0;
 HEAPF32[(17748)>>2] = 0.0;
 HEAPF32[(17752)>>2] = 1.0;
 HEAPF32[(17756)>>2] = 1.0;
 ;HEAP32[(17760)>>2]=0|0;HEAP32[(17760)+4>>2]=0|0;HEAP32[(17760)+8>>2]=0|0;HEAP32[(17760)+12>>2]=0|0;
 HEAPF32[(17776)>>2] = -1.0;
 HEAPF32[(17780)>>2] = 0.0;
 HEAPF32[(17784)>>2] = 1.0;
 HEAPF32[(17788)>>2] = 0.0;
 HEAPF32[(17792)>>2] = 1.0;
 HEAPF32[(17796)>>2] = 0.0;
 HEAPF32[(17800)>>2] = 0.0;
 HEAPF32[(17804)>>2] = 0.0;
 HEAPF32[(17808)>>2] = -1.0;
 HEAPF32[(17812)>>2] = 0.0;
 HEAPF32[(17816)>>2] = 0.0;
 HEAPF32[(17820)>>2] = 0.0;
 HEAPF32[(17824)>>2] = -1.0;
 HEAPF32[(17828)>>2] = 1.0;
 HEAPF32[(17832)>>2] = 0.0;
 HEAPF32[(17836)>>2] = 0.0;
 return;
}
function ___stdio_close($f) {
 $f = $f|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $vararg_buffer = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 16|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $0 = ((($f)) + 60|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$vararg_buffer>>2] = $1;
 $2 = (___syscall6(6,($vararg_buffer|0))|0);
 $3 = (___syscall_ret($2)|0);
 STACKTOP = sp;return ($3|0);
}
function ___syscall_ret($r) {
 $r = $r|0;
 var $$0 = 0, $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($r>>>0)>(4294963200);
 if ($0) {
  $1 = (0 - ($r))|0;
  $2 = (___errno_location()|0);
  HEAP32[$2>>2] = $1;
  $$0 = -1;
 } else {
  $$0 = $r;
 }
 return ($$0|0);
}
function ___errno_location() {
 var $$0 = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = HEAP32[4460]|0;
 $1 = ($0|0)==(0|0);
 if ($1) {
  $$0 = 17884;
 } else {
  $2 = (_pthread_self()|0);
  $3 = ((($2)) + 64|0);
  $4 = HEAP32[$3>>2]|0;
  $$0 = $4;
 }
 return ($$0|0);
}
function ___stdio_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $$0 = 0, $$phi$trans$insert = 0, $$pre = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0, $23 = 0;
 var $24 = 0, $25 = 0, $26 = 0, $27 = 0, $28 = 0, $29 = 0, $3 = 0, $30 = 0, $31 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0, $39 = 0, $4 = 0, $40 = 0, $41 = 0;
 var $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $cnt$0 = 0, $cnt$1 = 0, $iov$0 = 0, $iov$0$lcssa11 = 0, $iov$1 = 0, $iovcnt$0 = 0, $iovcnt$0$lcssa12 = 0;
 var $iovcnt$1 = 0, $iovs = 0, $rem$0 = 0, $vararg_buffer = 0, $vararg_buffer3 = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr6 = 0, $vararg_ptr7 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 48|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer3 = sp + 16|0;
 $vararg_buffer = sp;
 $iovs = sp + 32|0;
 $0 = ((($f)) + 28|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$iovs>>2] = $1;
 $2 = ((($iovs)) + 4|0);
 $3 = ((($f)) + 20|0);
 $4 = HEAP32[$3>>2]|0;
 $5 = (($4) - ($1))|0;
 HEAP32[$2>>2] = $5;
 $6 = ((($iovs)) + 8|0);
 HEAP32[$6>>2] = $buf;
 $7 = ((($iovs)) + 12|0);
 HEAP32[$7>>2] = $len;
 $8 = (($5) + ($len))|0;
 $9 = ((($f)) + 60|0);
 $10 = ((($f)) + 44|0);
 $iov$0 = $iovs;$iovcnt$0 = 2;$rem$0 = $8;
 while(1) {
  $11 = HEAP32[4460]|0;
  $12 = ($11|0)==(0|0);
  if ($12) {
   $16 = HEAP32[$9>>2]|0;
   HEAP32[$vararg_buffer3>>2] = $16;
   $vararg_ptr6 = ((($vararg_buffer3)) + 4|0);
   HEAP32[$vararg_ptr6>>2] = $iov$0;
   $vararg_ptr7 = ((($vararg_buffer3)) + 8|0);
   HEAP32[$vararg_ptr7>>2] = $iovcnt$0;
   $17 = (___syscall146(146,($vararg_buffer3|0))|0);
   $18 = (___syscall_ret($17)|0);
   $cnt$0 = $18;
  } else {
   _pthread_cleanup_push((9|0),($f|0));
   $13 = HEAP32[$9>>2]|0;
   HEAP32[$vararg_buffer>>2] = $13;
   $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
   HEAP32[$vararg_ptr1>>2] = $iov$0;
   $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
   HEAP32[$vararg_ptr2>>2] = $iovcnt$0;
   $14 = (___syscall146(146,($vararg_buffer|0))|0);
   $15 = (___syscall_ret($14)|0);
   _pthread_cleanup_pop(0);
   $cnt$0 = $15;
  }
  $19 = ($rem$0|0)==($cnt$0|0);
  if ($19) {
   label = 6;
   break;
  }
  $26 = ($cnt$0|0)<(0);
  if ($26) {
   $iov$0$lcssa11 = $iov$0;$iovcnt$0$lcssa12 = $iovcnt$0;
   label = 8;
   break;
  }
  $34 = (($rem$0) - ($cnt$0))|0;
  $35 = ((($iov$0)) + 4|0);
  $36 = HEAP32[$35>>2]|0;
  $37 = ($cnt$0>>>0)>($36>>>0);
  if ($37) {
   $38 = HEAP32[$10>>2]|0;
   HEAP32[$0>>2] = $38;
   HEAP32[$3>>2] = $38;
   $39 = (($cnt$0) - ($36))|0;
   $40 = ((($iov$0)) + 8|0);
   $41 = (($iovcnt$0) + -1)|0;
   $$phi$trans$insert = ((($iov$0)) + 12|0);
   $$pre = HEAP32[$$phi$trans$insert>>2]|0;
   $49 = $$pre;$cnt$1 = $39;$iov$1 = $40;$iovcnt$1 = $41;
  } else {
   $42 = ($iovcnt$0|0)==(2);
   if ($42) {
    $43 = HEAP32[$0>>2]|0;
    $44 = (($43) + ($cnt$0)|0);
    HEAP32[$0>>2] = $44;
    $49 = $36;$cnt$1 = $cnt$0;$iov$1 = $iov$0;$iovcnt$1 = 2;
   } else {
    $49 = $36;$cnt$1 = $cnt$0;$iov$1 = $iov$0;$iovcnt$1 = $iovcnt$0;
   }
  }
  $45 = HEAP32[$iov$1>>2]|0;
  $46 = (($45) + ($cnt$1)|0);
  HEAP32[$iov$1>>2] = $46;
  $47 = ((($iov$1)) + 4|0);
  $48 = (($49) - ($cnt$1))|0;
  HEAP32[$47>>2] = $48;
  $iov$0 = $iov$1;$iovcnt$0 = $iovcnt$1;$rem$0 = $34;
 }
 if ((label|0) == 6) {
  $20 = HEAP32[$10>>2]|0;
  $21 = ((($f)) + 48|0);
  $22 = HEAP32[$21>>2]|0;
  $23 = (($20) + ($22)|0);
  $24 = ((($f)) + 16|0);
  HEAP32[$24>>2] = $23;
  $25 = $20;
  HEAP32[$0>>2] = $25;
  HEAP32[$3>>2] = $25;
  $$0 = $len;
 }
 else if ((label|0) == 8) {
  $27 = ((($f)) + 16|0);
  HEAP32[$27>>2] = 0;
  HEAP32[$0>>2] = 0;
  HEAP32[$3>>2] = 0;
  $28 = HEAP32[$f>>2]|0;
  $29 = $28 | 32;
  HEAP32[$f>>2] = $29;
  $30 = ($iovcnt$0$lcssa12|0)==(2);
  if ($30) {
   $$0 = 0;
  } else {
   $31 = ((($iov$0$lcssa11)) + 4|0);
   $32 = HEAP32[$31>>2]|0;
   $33 = (($len) - ($32))|0;
   $$0 = $33;
  }
 }
 STACKTOP = sp;return ($$0|0);
}
function _cleanup_575($p) {
 $p = $p|0;
 var $0 = 0, $1 = 0, $2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($p)) + 68|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ($1|0)==(0);
 if ($2) {
  ___unlockfile($p);
 }
 return;
}
function ___unlockfile($f) {
 $f = $f|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return;
}
function ___stdio_seek($f,$off,$whence) {
 $f = $f|0;
 $off = $off|0;
 $whence = $whence|0;
 var $$pre = 0, $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $ret = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, $vararg_ptr3 = 0, $vararg_ptr4 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 32|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $ret = sp + 20|0;
 $0 = ((($f)) + 60|0);
 $1 = HEAP32[$0>>2]|0;
 HEAP32[$vararg_buffer>>2] = $1;
 $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
 HEAP32[$vararg_ptr1>>2] = 0;
 $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
 HEAP32[$vararg_ptr2>>2] = $off;
 $vararg_ptr3 = ((($vararg_buffer)) + 12|0);
 HEAP32[$vararg_ptr3>>2] = $ret;
 $vararg_ptr4 = ((($vararg_buffer)) + 16|0);
 HEAP32[$vararg_ptr4>>2] = $whence;
 $2 = (___syscall140(140,($vararg_buffer|0))|0);
 $3 = (___syscall_ret($2)|0);
 $4 = ($3|0)<(0);
 if ($4) {
  HEAP32[$ret>>2] = -1;
  $5 = -1;
 } else {
  $$pre = HEAP32[$ret>>2]|0;
  $5 = $$pre;
 }
 STACKTOP = sp;return ($5|0);
}
function ___stdout_write($f,$buf,$len) {
 $f = $f|0;
 $buf = $buf|0;
 $len = $len|0;
 var $0 = 0, $1 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $tio = 0, $vararg_buffer = 0, $vararg_ptr1 = 0, $vararg_ptr2 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 STACKTOP = STACKTOP + 80|0; if ((STACKTOP|0) >= (STACK_MAX|0)) abort();
 $vararg_buffer = sp;
 $tio = sp + 12|0;
 $0 = ((($f)) + 36|0);
 HEAP32[$0>>2] = 10;
 $1 = HEAP32[$f>>2]|0;
 $2 = $1 & 64;
 $3 = ($2|0)==(0);
 if ($3) {
  $4 = ((($f)) + 60|0);
  $5 = HEAP32[$4>>2]|0;
  HEAP32[$vararg_buffer>>2] = $5;
  $vararg_ptr1 = ((($vararg_buffer)) + 4|0);
  HEAP32[$vararg_ptr1>>2] = 21505;
  $vararg_ptr2 = ((($vararg_buffer)) + 8|0);
  HEAP32[$vararg_ptr2>>2] = $tio;
  $6 = (___syscall54(54,($vararg_buffer|0))|0);
  $7 = ($6|0)==(0);
  if (!($7)) {
   $8 = ((($f)) + 75|0);
   HEAP8[$8>>0] = -1;
  }
 }
 $9 = (___stdio_write($f,$buf,$len)|0);
 STACKTOP = sp;return ($9|0);
}
function ___lockfile($f) {
 $f = $f|0;
 var label = 0, sp = 0;
 sp = STACKTOP;
 return 0;
}
function _fflush($f) {
 $f = $f|0;
 var $$0 = 0, $$01 = 0, $$012 = 0, $$014 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $20 = 0, $21 = 0, $22 = 0;
 var $23 = 0, $24 = 0, $25 = 0, $26 = 0, $27 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0, $9 = 0, $phitmp = 0, $r$0$lcssa = 0, $r$03 = 0, $r$1 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($f|0)==(0|0);
 do {
  if ($0) {
   $7 = HEAP32[30]|0;
   $8 = ($7|0)==(0|0);
   if ($8) {
    $27 = 0;
   } else {
    $9 = HEAP32[30]|0;
    $10 = (_fflush($9)|0);
    $27 = $10;
   }
   ___lock(((17868)|0));
   $$012 = HEAP32[(17864)>>2]|0;
   $11 = ($$012|0)==(0|0);
   if ($11) {
    $r$0$lcssa = $27;
   } else {
    $$014 = $$012;$r$03 = $27;
    while(1) {
     $12 = ((($$014)) + 76|0);
     $13 = HEAP32[$12>>2]|0;
     $14 = ($13|0)>(-1);
     if ($14) {
      $15 = (___lockfile($$014)|0);
      $23 = $15;
     } else {
      $23 = 0;
     }
     $16 = ((($$014)) + 20|0);
     $17 = HEAP32[$16>>2]|0;
     $18 = ((($$014)) + 28|0);
     $19 = HEAP32[$18>>2]|0;
     $20 = ($17>>>0)>($19>>>0);
     if ($20) {
      $21 = (___fflush_unlocked($$014)|0);
      $22 = $21 | $r$03;
      $r$1 = $22;
     } else {
      $r$1 = $r$03;
     }
     $24 = ($23|0)==(0);
     if (!($24)) {
      ___unlockfile($$014);
     }
     $25 = ((($$014)) + 56|0);
     $$01 = HEAP32[$25>>2]|0;
     $26 = ($$01|0)==(0|0);
     if ($26) {
      $r$0$lcssa = $r$1;
      break;
     } else {
      $$014 = $$01;$r$03 = $r$1;
     }
    }
   }
   ___unlock(((17868)|0));
   $$0 = $r$0$lcssa;
  } else {
   $1 = ((($f)) + 76|0);
   $2 = HEAP32[$1>>2]|0;
   $3 = ($2|0)>(-1);
   if (!($3)) {
    $4 = (___fflush_unlocked($f)|0);
    $$0 = $4;
    break;
   }
   $5 = (___lockfile($f)|0);
   $phitmp = ($5|0)==(0);
   $6 = (___fflush_unlocked($f)|0);
   if ($phitmp) {
    $$0 = $6;
   } else {
    ___unlockfile($f);
    $$0 = $6;
   }
  }
 } while(0);
 return ($$0|0);
}
function ___fflush_unlocked($f) {
 $f = $f|0;
 var $$0 = 0, $0 = 0, $1 = 0, $10 = 0, $11 = 0, $12 = 0, $13 = 0, $14 = 0, $15 = 0, $16 = 0, $17 = 0, $18 = 0, $19 = 0, $2 = 0, $3 = 0, $4 = 0, $5 = 0, $6 = 0, $7 = 0, $8 = 0;
 var $9 = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ((($f)) + 20|0);
 $1 = HEAP32[$0>>2]|0;
 $2 = ((($f)) + 28|0);
 $3 = HEAP32[$2>>2]|0;
 $4 = ($1>>>0)>($3>>>0);
 if ($4) {
  $5 = ((($f)) + 36|0);
  $6 = HEAP32[$5>>2]|0;
  (FUNCTION_TABLE_iiii[$6 & 15]($f,0,0)|0);
  $7 = HEAP32[$0>>2]|0;
  $8 = ($7|0)==(0|0);
  if ($8) {
   $$0 = -1;
  } else {
   label = 3;
  }
 } else {
  label = 3;
 }
 if ((label|0) == 3) {
  $9 = ((($f)) + 4|0);
  $10 = HEAP32[$9>>2]|0;
  $11 = ((($f)) + 8|0);
  $12 = HEAP32[$11>>2]|0;
  $13 = ($10>>>0)<($12>>>0);
  if ($13) {
   $14 = ((($f)) + 40|0);
   $15 = HEAP32[$14>>2]|0;
   $16 = $10;
   $17 = $12;
   $18 = (($16) - ($17))|0;
   (FUNCTION_TABLE_iiii[$15 & 15]($f,$18,1)|0);
  }
  $19 = ((($f)) + 16|0);
  HEAP32[$19>>2] = 0;
  HEAP32[$2>>2] = 0;
  HEAP32[$0>>2] = 0;
  HEAP32[$11>>2] = 0;
  HEAP32[$9>>2] = 0;
  $$0 = 0;
 }
 return ($$0|0);
}
function _malloc($bytes) {
 $bytes = $bytes|0;
 var $$0 = 0, $$lcssa = 0, $$lcssa141 = 0, $$lcssa142 = 0, $$lcssa144 = 0, $$lcssa147 = 0, $$lcssa149 = 0, $$lcssa151 = 0, $$lcssa153 = 0, $$lcssa155 = 0, $$lcssa157 = 0, $$not$i = 0, $$pre = 0, $$pre$i = 0, $$pre$i$i = 0, $$pre$i13 = 0, $$pre$i16$i = 0, $$pre$phi$i$iZ2D = 0, $$pre$phi$i14Z2D = 0, $$pre$phi$i17$iZ2D = 0;
 var $$pre$phi$iZ2D = 0, $$pre$phi10$i$iZ2D = 0, $$pre$phiZ2D = 0, $$pre71 = 0, $$pre9$i$i = 0, $$rsize$0$i = 0, $$rsize$4$i = 0, $$v$0$i = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $1000 = 0, $1001 = 0, $1002 = 0, $1003 = 0, $1004 = 0, $1005 = 0, $1006 = 0, $1007 = 0;
 var $1008 = 0, $1009 = 0, $101 = 0, $1010 = 0, $1011 = 0, $1012 = 0, $1013 = 0, $1014 = 0, $1015 = 0, $1016 = 0, $1017 = 0, $1018 = 0, $1019 = 0, $102 = 0, $1020 = 0, $1021 = 0, $1022 = 0, $1023 = 0, $1024 = 0, $1025 = 0;
 var $1026 = 0, $1027 = 0, $1028 = 0, $1029 = 0, $103 = 0, $1030 = 0, $1031 = 0, $1032 = 0, $1033 = 0, $1034 = 0, $1035 = 0, $1036 = 0, $1037 = 0, $1038 = 0, $1039 = 0, $104 = 0, $1040 = 0, $1041 = 0, $1042 = 0, $1043 = 0;
 var $1044 = 0, $1045 = 0, $1046 = 0, $1047 = 0, $1048 = 0, $1049 = 0, $105 = 0, $1050 = 0, $1051 = 0, $1052 = 0, $1053 = 0, $1054 = 0, $1055 = 0, $1056 = 0, $1057 = 0, $1058 = 0, $1059 = 0, $106 = 0, $1060 = 0, $1061 = 0;
 var $1062 = 0, $1063 = 0, $107 = 0, $108 = 0, $109 = 0, $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0;
 var $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0, $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0;
 var $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0, $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0;
 var $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0, $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0;
 var $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0, $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0;
 var $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0, $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0;
 var $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0, $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0;
 var $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0, $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0;
 var $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0, $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0;
 var $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0, $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0;
 var $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0, $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0;
 var $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0, $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $320 = 0;
 var $321 = 0, $322 = 0, $323 = 0, $324 = 0, $325 = 0, $326 = 0, $327 = 0, $328 = 0, $329 = 0, $33 = 0, $330 = 0, $331 = 0, $332 = 0, $333 = 0, $334 = 0, $335 = 0, $336 = 0, $337 = 0, $338 = 0, $339 = 0;
 var $34 = 0, $340 = 0, $341 = 0, $342 = 0, $343 = 0, $344 = 0, $345 = 0, $346 = 0, $347 = 0, $348 = 0, $349 = 0, $35 = 0, $350 = 0, $351 = 0, $352 = 0, $353 = 0, $354 = 0, $355 = 0, $356 = 0, $357 = 0;
 var $358 = 0, $359 = 0, $36 = 0, $360 = 0, $361 = 0, $362 = 0, $363 = 0, $364 = 0, $365 = 0, $366 = 0, $367 = 0, $368 = 0, $369 = 0, $37 = 0, $370 = 0, $371 = 0, $372 = 0, $373 = 0, $374 = 0, $375 = 0;
 var $376 = 0, $377 = 0, $378 = 0, $379 = 0, $38 = 0, $380 = 0, $381 = 0, $382 = 0, $383 = 0, $384 = 0, $385 = 0, $386 = 0, $387 = 0, $388 = 0, $389 = 0, $39 = 0, $390 = 0, $391 = 0, $392 = 0, $393 = 0;
 var $394 = 0, $395 = 0, $396 = 0, $397 = 0, $398 = 0, $399 = 0, $4 = 0, $40 = 0, $400 = 0, $401 = 0, $402 = 0, $403 = 0, $404 = 0, $405 = 0, $406 = 0, $407 = 0, $408 = 0, $409 = 0, $41 = 0, $410 = 0;
 var $411 = 0, $412 = 0, $413 = 0, $414 = 0, $415 = 0, $416 = 0, $417 = 0, $418 = 0, $419 = 0, $42 = 0, $420 = 0, $421 = 0, $422 = 0, $423 = 0, $424 = 0, $425 = 0, $426 = 0, $427 = 0, $428 = 0, $429 = 0;
 var $43 = 0, $430 = 0, $431 = 0, $432 = 0, $433 = 0, $434 = 0, $435 = 0, $436 = 0, $437 = 0, $438 = 0, $439 = 0, $44 = 0, $440 = 0, $441 = 0, $442 = 0, $443 = 0, $444 = 0, $445 = 0, $446 = 0, $447 = 0;
 var $448 = 0, $449 = 0, $45 = 0, $450 = 0, $451 = 0, $452 = 0, $453 = 0, $454 = 0, $455 = 0, $456 = 0, $457 = 0, $458 = 0, $459 = 0, $46 = 0, $460 = 0, $461 = 0, $462 = 0, $463 = 0, $464 = 0, $465 = 0;
 var $466 = 0, $467 = 0, $468 = 0, $469 = 0, $47 = 0, $470 = 0, $471 = 0, $472 = 0, $473 = 0, $474 = 0, $475 = 0, $476 = 0, $477 = 0, $478 = 0, $479 = 0, $48 = 0, $480 = 0, $481 = 0, $482 = 0, $483 = 0;
 var $484 = 0, $485 = 0, $486 = 0, $487 = 0, $488 = 0, $489 = 0, $49 = 0, $490 = 0, $491 = 0, $492 = 0, $493 = 0, $494 = 0, $495 = 0, $496 = 0, $497 = 0, $498 = 0, $499 = 0, $5 = 0, $50 = 0, $500 = 0;
 var $501 = 0, $502 = 0, $503 = 0, $504 = 0, $505 = 0, $506 = 0, $507 = 0, $508 = 0, $509 = 0, $51 = 0, $510 = 0, $511 = 0, $512 = 0, $513 = 0, $514 = 0, $515 = 0, $516 = 0, $517 = 0, $518 = 0, $519 = 0;
 var $52 = 0, $520 = 0, $521 = 0, $522 = 0, $523 = 0, $524 = 0, $525 = 0, $526 = 0, $527 = 0, $528 = 0, $529 = 0, $53 = 0, $530 = 0, $531 = 0, $532 = 0, $533 = 0, $534 = 0, $535 = 0, $536 = 0, $537 = 0;
 var $538 = 0, $539 = 0, $54 = 0, $540 = 0, $541 = 0, $542 = 0, $543 = 0, $544 = 0, $545 = 0, $546 = 0, $547 = 0, $548 = 0, $549 = 0, $55 = 0, $550 = 0, $551 = 0, $552 = 0, $553 = 0, $554 = 0, $555 = 0;
 var $556 = 0, $557 = 0, $558 = 0, $559 = 0, $56 = 0, $560 = 0, $561 = 0, $562 = 0, $563 = 0, $564 = 0, $565 = 0, $566 = 0, $567 = 0, $568 = 0, $569 = 0, $57 = 0, $570 = 0, $571 = 0, $572 = 0, $573 = 0;
 var $574 = 0, $575 = 0, $576 = 0, $577 = 0, $578 = 0, $579 = 0, $58 = 0, $580 = 0, $581 = 0, $582 = 0, $583 = 0, $584 = 0, $585 = 0, $586 = 0, $587 = 0, $588 = 0, $589 = 0, $59 = 0, $590 = 0, $591 = 0;
 var $592 = 0, $593 = 0, $594 = 0, $595 = 0, $596 = 0, $597 = 0, $598 = 0, $599 = 0, $6 = 0, $60 = 0, $600 = 0, $601 = 0, $602 = 0, $603 = 0, $604 = 0, $605 = 0, $606 = 0, $607 = 0, $608 = 0, $609 = 0;
 var $61 = 0, $610 = 0, $611 = 0, $612 = 0, $613 = 0, $614 = 0, $615 = 0, $616 = 0, $617 = 0, $618 = 0, $619 = 0, $62 = 0, $620 = 0, $621 = 0, $622 = 0, $623 = 0, $624 = 0, $625 = 0, $626 = 0, $627 = 0;
 var $628 = 0, $629 = 0, $63 = 0, $630 = 0, $631 = 0, $632 = 0, $633 = 0, $634 = 0, $635 = 0, $636 = 0, $637 = 0, $638 = 0, $639 = 0, $64 = 0, $640 = 0, $641 = 0, $642 = 0, $643 = 0, $644 = 0, $645 = 0;
 var $646 = 0, $647 = 0, $648 = 0, $649 = 0, $65 = 0, $650 = 0, $651 = 0, $652 = 0, $653 = 0, $654 = 0, $655 = 0, $656 = 0, $657 = 0, $658 = 0, $659 = 0, $66 = 0, $660 = 0, $661 = 0, $662 = 0, $663 = 0;
 var $664 = 0, $665 = 0, $666 = 0, $667 = 0, $668 = 0, $669 = 0, $67 = 0, $670 = 0, $671 = 0, $672 = 0, $673 = 0, $674 = 0, $675 = 0, $676 = 0, $677 = 0, $678 = 0, $679 = 0, $68 = 0, $680 = 0, $681 = 0;
 var $682 = 0, $683 = 0, $684 = 0, $685 = 0, $686 = 0, $687 = 0, $688 = 0, $689 = 0, $69 = 0, $690 = 0, $691 = 0, $692 = 0, $693 = 0, $694 = 0, $695 = 0, $696 = 0, $697 = 0, $698 = 0, $699 = 0, $7 = 0;
 var $70 = 0, $700 = 0, $701 = 0, $702 = 0, $703 = 0, $704 = 0, $705 = 0, $706 = 0, $707 = 0, $708 = 0, $709 = 0, $71 = 0, $710 = 0, $711 = 0, $712 = 0, $713 = 0, $714 = 0, $715 = 0, $716 = 0, $717 = 0;
 var $718 = 0, $719 = 0, $72 = 0, $720 = 0, $721 = 0, $722 = 0, $723 = 0, $724 = 0, $725 = 0, $726 = 0, $727 = 0, $728 = 0, $729 = 0, $73 = 0, $730 = 0, $731 = 0, $732 = 0, $733 = 0, $734 = 0, $735 = 0;
 var $736 = 0, $737 = 0, $738 = 0, $739 = 0, $74 = 0, $740 = 0, $741 = 0, $742 = 0, $743 = 0, $744 = 0, $745 = 0, $746 = 0, $747 = 0, $748 = 0, $749 = 0, $75 = 0, $750 = 0, $751 = 0, $752 = 0, $753 = 0;
 var $754 = 0, $755 = 0, $756 = 0, $757 = 0, $758 = 0, $759 = 0, $76 = 0, $760 = 0, $761 = 0, $762 = 0, $763 = 0, $764 = 0, $765 = 0, $766 = 0, $767 = 0, $768 = 0, $769 = 0, $77 = 0, $770 = 0, $771 = 0;
 var $772 = 0, $773 = 0, $774 = 0, $775 = 0, $776 = 0, $777 = 0, $778 = 0, $779 = 0, $78 = 0, $780 = 0, $781 = 0, $782 = 0, $783 = 0, $784 = 0, $785 = 0, $786 = 0, $787 = 0, $788 = 0, $789 = 0, $79 = 0;
 var $790 = 0, $791 = 0, $792 = 0, $793 = 0, $794 = 0, $795 = 0, $796 = 0, $797 = 0, $798 = 0, $799 = 0, $8 = 0, $80 = 0, $800 = 0, $801 = 0, $802 = 0, $803 = 0, $804 = 0, $805 = 0, $806 = 0, $807 = 0;
 var $808 = 0, $809 = 0, $81 = 0, $810 = 0, $811 = 0, $812 = 0, $813 = 0, $814 = 0, $815 = 0, $816 = 0, $817 = 0, $818 = 0, $819 = 0, $82 = 0, $820 = 0, $821 = 0, $822 = 0, $823 = 0, $824 = 0, $825 = 0;
 var $826 = 0, $827 = 0, $828 = 0, $829 = 0, $83 = 0, $830 = 0, $831 = 0, $832 = 0, $833 = 0, $834 = 0, $835 = 0, $836 = 0, $837 = 0, $838 = 0, $839 = 0, $84 = 0, $840 = 0, $841 = 0, $842 = 0, $843 = 0;
 var $844 = 0, $845 = 0, $846 = 0, $847 = 0, $848 = 0, $849 = 0, $85 = 0, $850 = 0, $851 = 0, $852 = 0, $853 = 0, $854 = 0, $855 = 0, $856 = 0, $857 = 0, $858 = 0, $859 = 0, $86 = 0, $860 = 0, $861 = 0;
 var $862 = 0, $863 = 0, $864 = 0, $865 = 0, $866 = 0, $867 = 0, $868 = 0, $869 = 0, $87 = 0, $870 = 0, $871 = 0, $872 = 0, $873 = 0, $874 = 0, $875 = 0, $876 = 0, $877 = 0, $878 = 0, $879 = 0, $88 = 0;
 var $880 = 0, $881 = 0, $882 = 0, $883 = 0, $884 = 0, $885 = 0, $886 = 0, $887 = 0, $888 = 0, $889 = 0, $89 = 0, $890 = 0, $891 = 0, $892 = 0, $893 = 0, $894 = 0, $895 = 0, $896 = 0, $897 = 0, $898 = 0;
 var $899 = 0, $9 = 0, $90 = 0, $900 = 0, $901 = 0, $902 = 0, $903 = 0, $904 = 0, $905 = 0, $906 = 0, $907 = 0, $908 = 0, $909 = 0, $91 = 0, $910 = 0, $911 = 0, $912 = 0, $913 = 0, $914 = 0, $915 = 0;
 var $916 = 0, $917 = 0, $918 = 0, $919 = 0, $92 = 0, $920 = 0, $921 = 0, $922 = 0, $923 = 0, $924 = 0, $925 = 0, $926 = 0, $927 = 0, $928 = 0, $929 = 0, $93 = 0, $930 = 0, $931 = 0, $932 = 0, $933 = 0;
 var $934 = 0, $935 = 0, $936 = 0, $937 = 0, $938 = 0, $939 = 0, $94 = 0, $940 = 0, $941 = 0, $942 = 0, $943 = 0, $944 = 0, $945 = 0, $946 = 0, $947 = 0, $948 = 0, $949 = 0, $95 = 0, $950 = 0, $951 = 0;
 var $952 = 0, $953 = 0, $954 = 0, $955 = 0, $956 = 0, $957 = 0, $958 = 0, $959 = 0, $96 = 0, $960 = 0, $961 = 0, $962 = 0, $963 = 0, $964 = 0, $965 = 0, $966 = 0, $967 = 0, $968 = 0, $969 = 0, $97 = 0;
 var $970 = 0, $971 = 0, $972 = 0, $973 = 0, $974 = 0, $975 = 0, $976 = 0, $977 = 0, $978 = 0, $979 = 0, $98 = 0, $980 = 0, $981 = 0, $982 = 0, $983 = 0, $984 = 0, $985 = 0, $986 = 0, $987 = 0, $988 = 0;
 var $989 = 0, $99 = 0, $990 = 0, $991 = 0, $992 = 0, $993 = 0, $994 = 0, $995 = 0, $996 = 0, $997 = 0, $998 = 0, $999 = 0, $F$0$i$i = 0, $F1$0$i = 0, $F4$0 = 0, $F4$0$i$i = 0, $F5$0$i = 0, $I1$0$i$i = 0, $I7$0$i = 0, $I7$0$i$i = 0;
 var $K12$0$i = 0, $K2$0$i$i = 0, $K8$0$i$i = 0, $R$1$i = 0, $R$1$i$i = 0, $R$1$i$i$lcssa = 0, $R$1$i$lcssa = 0, $R$1$i9 = 0, $R$1$i9$lcssa = 0, $R$3$i = 0, $R$3$i$i = 0, $R$3$i11 = 0, $RP$1$i = 0, $RP$1$i$i = 0, $RP$1$i$i$lcssa = 0, $RP$1$i$lcssa = 0, $RP$1$i8 = 0, $RP$1$i8$lcssa = 0, $T$0$i = 0, $T$0$i$i = 0;
 var $T$0$i$i$lcssa = 0, $T$0$i$i$lcssa140 = 0, $T$0$i$lcssa = 0, $T$0$i$lcssa156 = 0, $T$0$i18$i = 0, $T$0$i18$i$lcssa = 0, $T$0$i18$i$lcssa139 = 0, $br$2$ph$i = 0, $cond$i = 0, $cond$i$i = 0, $cond$i12 = 0, $exitcond$i$i = 0, $i$01$i$i = 0, $idx$0$i = 0, $nb$0 = 0, $not$$i$i = 0, $not$$i20$i = 0, $not$7$i = 0, $oldfirst$0$i$i = 0, $or$cond$i = 0;
 var $or$cond$i17 = 0, $or$cond1$i = 0, $or$cond1$i16 = 0, $or$cond10$i = 0, $or$cond11$i = 0, $or$cond2$i = 0, $or$cond48$i = 0, $or$cond5$i = 0, $or$cond7$i = 0, $or$cond8$i = 0, $p$0$i$i = 0, $qsize$0$i$i = 0, $rsize$0$i = 0, $rsize$0$i$lcssa = 0, $rsize$0$i5 = 0, $rsize$1$i = 0, $rsize$3$i = 0, $rsize$4$lcssa$i = 0, $rsize$412$i = 0, $rst$0$i = 0;
 var $rst$1$i = 0, $sizebits$0$$i = 0, $sizebits$0$i = 0, $sp$0$i$i = 0, $sp$0$i$i$i = 0, $sp$068$i = 0, $sp$068$i$lcssa = 0, $sp$167$i = 0, $sp$167$i$lcssa = 0, $ssize$0$i = 0, $ssize$2$ph$i = 0, $ssize$5$i = 0, $t$0$i = 0, $t$0$i4 = 0, $t$2$i = 0, $t$4$ph$i = 0, $t$4$v$4$i = 0, $t$411$i = 0, $tbase$746$i = 0, $tsize$745$i = 0;
 var $v$0$i = 0, $v$0$i$lcssa = 0, $v$0$i6 = 0, $v$1$i = 0, $v$3$i = 0, $v$4$lcssa$i = 0, $v$413$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($bytes>>>0)<(245);
 do {
  if ($0) {
   $1 = ($bytes>>>0)<(11);
   $2 = (($bytes) + 11)|0;
   $3 = $2 & -8;
   $4 = $1 ? 16 : $3;
   $5 = $4 >>> 3;
   $6 = HEAP32[4472]|0;
   $7 = $6 >>> $5;
   $8 = $7 & 3;
   $9 = ($8|0)==(0);
   if (!($9)) {
    $10 = $7 & 1;
    $11 = $10 ^ 1;
    $12 = (($11) + ($5))|0;
    $13 = $12 << 1;
    $14 = (17928 + ($13<<2)|0);
    $15 = ((($14)) + 8|0);
    $16 = HEAP32[$15>>2]|0;
    $17 = ((($16)) + 8|0);
    $18 = HEAP32[$17>>2]|0;
    $19 = ($14|0)==($18|0);
    do {
     if ($19) {
      $20 = 1 << $12;
      $21 = $20 ^ -1;
      $22 = $6 & $21;
      HEAP32[4472] = $22;
     } else {
      $23 = HEAP32[(17904)>>2]|0;
      $24 = ($18>>>0)<($23>>>0);
      if ($24) {
       _abort();
       // unreachable;
      }
      $25 = ((($18)) + 12|0);
      $26 = HEAP32[$25>>2]|0;
      $27 = ($26|0)==($16|0);
      if ($27) {
       HEAP32[$25>>2] = $14;
       HEAP32[$15>>2] = $18;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $28 = $12 << 3;
    $29 = $28 | 3;
    $30 = ((($16)) + 4|0);
    HEAP32[$30>>2] = $29;
    $31 = (($16) + ($28)|0);
    $32 = ((($31)) + 4|0);
    $33 = HEAP32[$32>>2]|0;
    $34 = $33 | 1;
    HEAP32[$32>>2] = $34;
    $$0 = $17;
    return ($$0|0);
   }
   $35 = HEAP32[(17896)>>2]|0;
   $36 = ($4>>>0)>($35>>>0);
   if ($36) {
    $37 = ($7|0)==(0);
    if (!($37)) {
     $38 = $7 << $5;
     $39 = 2 << $5;
     $40 = (0 - ($39))|0;
     $41 = $39 | $40;
     $42 = $38 & $41;
     $43 = (0 - ($42))|0;
     $44 = $42 & $43;
     $45 = (($44) + -1)|0;
     $46 = $45 >>> 12;
     $47 = $46 & 16;
     $48 = $45 >>> $47;
     $49 = $48 >>> 5;
     $50 = $49 & 8;
     $51 = $50 | $47;
     $52 = $48 >>> $50;
     $53 = $52 >>> 2;
     $54 = $53 & 4;
     $55 = $51 | $54;
     $56 = $52 >>> $54;
     $57 = $56 >>> 1;
     $58 = $57 & 2;
     $59 = $55 | $58;
     $60 = $56 >>> $58;
     $61 = $60 >>> 1;
     $62 = $61 & 1;
     $63 = $59 | $62;
     $64 = $60 >>> $62;
     $65 = (($63) + ($64))|0;
     $66 = $65 << 1;
     $67 = (17928 + ($66<<2)|0);
     $68 = ((($67)) + 8|0);
     $69 = HEAP32[$68>>2]|0;
     $70 = ((($69)) + 8|0);
     $71 = HEAP32[$70>>2]|0;
     $72 = ($67|0)==($71|0);
     do {
      if ($72) {
       $73 = 1 << $65;
       $74 = $73 ^ -1;
       $75 = $6 & $74;
       HEAP32[4472] = $75;
       $89 = $35;
      } else {
       $76 = HEAP32[(17904)>>2]|0;
       $77 = ($71>>>0)<($76>>>0);
       if ($77) {
        _abort();
        // unreachable;
       }
       $78 = ((($71)) + 12|0);
       $79 = HEAP32[$78>>2]|0;
       $80 = ($79|0)==($69|0);
       if ($80) {
        HEAP32[$78>>2] = $67;
        HEAP32[$68>>2] = $71;
        $$pre = HEAP32[(17896)>>2]|0;
        $89 = $$pre;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $81 = $65 << 3;
     $82 = (($81) - ($4))|0;
     $83 = $4 | 3;
     $84 = ((($69)) + 4|0);
     HEAP32[$84>>2] = $83;
     $85 = (($69) + ($4)|0);
     $86 = $82 | 1;
     $87 = ((($85)) + 4|0);
     HEAP32[$87>>2] = $86;
     $88 = (($85) + ($82)|0);
     HEAP32[$88>>2] = $82;
     $90 = ($89|0)==(0);
     if (!($90)) {
      $91 = HEAP32[(17908)>>2]|0;
      $92 = $89 >>> 3;
      $93 = $92 << 1;
      $94 = (17928 + ($93<<2)|0);
      $95 = HEAP32[4472]|0;
      $96 = 1 << $92;
      $97 = $95 & $96;
      $98 = ($97|0)==(0);
      if ($98) {
       $99 = $95 | $96;
       HEAP32[4472] = $99;
       $$pre71 = ((($94)) + 8|0);
       $$pre$phiZ2D = $$pre71;$F4$0 = $94;
      } else {
       $100 = ((($94)) + 8|0);
       $101 = HEAP32[$100>>2]|0;
       $102 = HEAP32[(17904)>>2]|0;
       $103 = ($101>>>0)<($102>>>0);
       if ($103) {
        _abort();
        // unreachable;
       } else {
        $$pre$phiZ2D = $100;$F4$0 = $101;
       }
      }
      HEAP32[$$pre$phiZ2D>>2] = $91;
      $104 = ((($F4$0)) + 12|0);
      HEAP32[$104>>2] = $91;
      $105 = ((($91)) + 8|0);
      HEAP32[$105>>2] = $F4$0;
      $106 = ((($91)) + 12|0);
      HEAP32[$106>>2] = $94;
     }
     HEAP32[(17896)>>2] = $82;
     HEAP32[(17908)>>2] = $85;
     $$0 = $70;
     return ($$0|0);
    }
    $107 = HEAP32[(17892)>>2]|0;
    $108 = ($107|0)==(0);
    if ($108) {
     $nb$0 = $4;
    } else {
     $109 = (0 - ($107))|0;
     $110 = $107 & $109;
     $111 = (($110) + -1)|0;
     $112 = $111 >>> 12;
     $113 = $112 & 16;
     $114 = $111 >>> $113;
     $115 = $114 >>> 5;
     $116 = $115 & 8;
     $117 = $116 | $113;
     $118 = $114 >>> $116;
     $119 = $118 >>> 2;
     $120 = $119 & 4;
     $121 = $117 | $120;
     $122 = $118 >>> $120;
     $123 = $122 >>> 1;
     $124 = $123 & 2;
     $125 = $121 | $124;
     $126 = $122 >>> $124;
     $127 = $126 >>> 1;
     $128 = $127 & 1;
     $129 = $125 | $128;
     $130 = $126 >>> $128;
     $131 = (($129) + ($130))|0;
     $132 = (18192 + ($131<<2)|0);
     $133 = HEAP32[$132>>2]|0;
     $134 = ((($133)) + 4|0);
     $135 = HEAP32[$134>>2]|0;
     $136 = $135 & -8;
     $137 = (($136) - ($4))|0;
     $rsize$0$i = $137;$t$0$i = $133;$v$0$i = $133;
     while(1) {
      $138 = ((($t$0$i)) + 16|0);
      $139 = HEAP32[$138>>2]|0;
      $140 = ($139|0)==(0|0);
      if ($140) {
       $141 = ((($t$0$i)) + 20|0);
       $142 = HEAP32[$141>>2]|0;
       $143 = ($142|0)==(0|0);
       if ($143) {
        $rsize$0$i$lcssa = $rsize$0$i;$v$0$i$lcssa = $v$0$i;
        break;
       } else {
        $145 = $142;
       }
      } else {
       $145 = $139;
      }
      $144 = ((($145)) + 4|0);
      $146 = HEAP32[$144>>2]|0;
      $147 = $146 & -8;
      $148 = (($147) - ($4))|0;
      $149 = ($148>>>0)<($rsize$0$i>>>0);
      $$rsize$0$i = $149 ? $148 : $rsize$0$i;
      $$v$0$i = $149 ? $145 : $v$0$i;
      $rsize$0$i = $$rsize$0$i;$t$0$i = $145;$v$0$i = $$v$0$i;
     }
     $150 = HEAP32[(17904)>>2]|0;
     $151 = ($v$0$i$lcssa>>>0)<($150>>>0);
     if ($151) {
      _abort();
      // unreachable;
     }
     $152 = (($v$0$i$lcssa) + ($4)|0);
     $153 = ($v$0$i$lcssa>>>0)<($152>>>0);
     if (!($153)) {
      _abort();
      // unreachable;
     }
     $154 = ((($v$0$i$lcssa)) + 24|0);
     $155 = HEAP32[$154>>2]|0;
     $156 = ((($v$0$i$lcssa)) + 12|0);
     $157 = HEAP32[$156>>2]|0;
     $158 = ($157|0)==($v$0$i$lcssa|0);
     do {
      if ($158) {
       $168 = ((($v$0$i$lcssa)) + 20|0);
       $169 = HEAP32[$168>>2]|0;
       $170 = ($169|0)==(0|0);
       if ($170) {
        $171 = ((($v$0$i$lcssa)) + 16|0);
        $172 = HEAP32[$171>>2]|0;
        $173 = ($172|0)==(0|0);
        if ($173) {
         $R$3$i = 0;
         break;
        } else {
         $R$1$i = $172;$RP$1$i = $171;
        }
       } else {
        $R$1$i = $169;$RP$1$i = $168;
       }
       while(1) {
        $174 = ((($R$1$i)) + 20|0);
        $175 = HEAP32[$174>>2]|0;
        $176 = ($175|0)==(0|0);
        if (!($176)) {
         $R$1$i = $175;$RP$1$i = $174;
         continue;
        }
        $177 = ((($R$1$i)) + 16|0);
        $178 = HEAP32[$177>>2]|0;
        $179 = ($178|0)==(0|0);
        if ($179) {
         $R$1$i$lcssa = $R$1$i;$RP$1$i$lcssa = $RP$1$i;
         break;
        } else {
         $R$1$i = $178;$RP$1$i = $177;
        }
       }
       $180 = ($RP$1$i$lcssa>>>0)<($150>>>0);
       if ($180) {
        _abort();
        // unreachable;
       } else {
        HEAP32[$RP$1$i$lcssa>>2] = 0;
        $R$3$i = $R$1$i$lcssa;
        break;
       }
      } else {
       $159 = ((($v$0$i$lcssa)) + 8|0);
       $160 = HEAP32[$159>>2]|0;
       $161 = ($160>>>0)<($150>>>0);
       if ($161) {
        _abort();
        // unreachable;
       }
       $162 = ((($160)) + 12|0);
       $163 = HEAP32[$162>>2]|0;
       $164 = ($163|0)==($v$0$i$lcssa|0);
       if (!($164)) {
        _abort();
        // unreachable;
       }
       $165 = ((($157)) + 8|0);
       $166 = HEAP32[$165>>2]|0;
       $167 = ($166|0)==($v$0$i$lcssa|0);
       if ($167) {
        HEAP32[$162>>2] = $157;
        HEAP32[$165>>2] = $160;
        $R$3$i = $157;
        break;
       } else {
        _abort();
        // unreachable;
       }
      }
     } while(0);
     $181 = ($155|0)==(0|0);
     do {
      if (!($181)) {
       $182 = ((($v$0$i$lcssa)) + 28|0);
       $183 = HEAP32[$182>>2]|0;
       $184 = (18192 + ($183<<2)|0);
       $185 = HEAP32[$184>>2]|0;
       $186 = ($v$0$i$lcssa|0)==($185|0);
       if ($186) {
        HEAP32[$184>>2] = $R$3$i;
        $cond$i = ($R$3$i|0)==(0|0);
        if ($cond$i) {
         $187 = 1 << $183;
         $188 = $187 ^ -1;
         $189 = HEAP32[(17892)>>2]|0;
         $190 = $189 & $188;
         HEAP32[(17892)>>2] = $190;
         break;
        }
       } else {
        $191 = HEAP32[(17904)>>2]|0;
        $192 = ($155>>>0)<($191>>>0);
        if ($192) {
         _abort();
         // unreachable;
        }
        $193 = ((($155)) + 16|0);
        $194 = HEAP32[$193>>2]|0;
        $195 = ($194|0)==($v$0$i$lcssa|0);
        if ($195) {
         HEAP32[$193>>2] = $R$3$i;
        } else {
         $196 = ((($155)) + 20|0);
         HEAP32[$196>>2] = $R$3$i;
        }
        $197 = ($R$3$i|0)==(0|0);
        if ($197) {
         break;
        }
       }
       $198 = HEAP32[(17904)>>2]|0;
       $199 = ($R$3$i>>>0)<($198>>>0);
       if ($199) {
        _abort();
        // unreachable;
       }
       $200 = ((($R$3$i)) + 24|0);
       HEAP32[$200>>2] = $155;
       $201 = ((($v$0$i$lcssa)) + 16|0);
       $202 = HEAP32[$201>>2]|0;
       $203 = ($202|0)==(0|0);
       do {
        if (!($203)) {
         $204 = ($202>>>0)<($198>>>0);
         if ($204) {
          _abort();
          // unreachable;
         } else {
          $205 = ((($R$3$i)) + 16|0);
          HEAP32[$205>>2] = $202;
          $206 = ((($202)) + 24|0);
          HEAP32[$206>>2] = $R$3$i;
          break;
         }
        }
       } while(0);
       $207 = ((($v$0$i$lcssa)) + 20|0);
       $208 = HEAP32[$207>>2]|0;
       $209 = ($208|0)==(0|0);
       if (!($209)) {
        $210 = HEAP32[(17904)>>2]|0;
        $211 = ($208>>>0)<($210>>>0);
        if ($211) {
         _abort();
         // unreachable;
        } else {
         $212 = ((($R$3$i)) + 20|0);
         HEAP32[$212>>2] = $208;
         $213 = ((($208)) + 24|0);
         HEAP32[$213>>2] = $R$3$i;
         break;
        }
       }
      }
     } while(0);
     $214 = ($rsize$0$i$lcssa>>>0)<(16);
     if ($214) {
      $215 = (($rsize$0$i$lcssa) + ($4))|0;
      $216 = $215 | 3;
      $217 = ((($v$0$i$lcssa)) + 4|0);
      HEAP32[$217>>2] = $216;
      $218 = (($v$0$i$lcssa) + ($215)|0);
      $219 = ((($218)) + 4|0);
      $220 = HEAP32[$219>>2]|0;
      $221 = $220 | 1;
      HEAP32[$219>>2] = $221;
     } else {
      $222 = $4 | 3;
      $223 = ((($v$0$i$lcssa)) + 4|0);
      HEAP32[$223>>2] = $222;
      $224 = $rsize$0$i$lcssa | 1;
      $225 = ((($152)) + 4|0);
      HEAP32[$225>>2] = $224;
      $226 = (($152) + ($rsize$0$i$lcssa)|0);
      HEAP32[$226>>2] = $rsize$0$i$lcssa;
      $227 = HEAP32[(17896)>>2]|0;
      $228 = ($227|0)==(0);
      if (!($228)) {
       $229 = HEAP32[(17908)>>2]|0;
       $230 = $227 >>> 3;
       $231 = $230 << 1;
       $232 = (17928 + ($231<<2)|0);
       $233 = HEAP32[4472]|0;
       $234 = 1 << $230;
       $235 = $233 & $234;
       $236 = ($235|0)==(0);
       if ($236) {
        $237 = $233 | $234;
        HEAP32[4472] = $237;
        $$pre$i = ((($232)) + 8|0);
        $$pre$phi$iZ2D = $$pre$i;$F1$0$i = $232;
       } else {
        $238 = ((($232)) + 8|0);
        $239 = HEAP32[$238>>2]|0;
        $240 = HEAP32[(17904)>>2]|0;
        $241 = ($239>>>0)<($240>>>0);
        if ($241) {
         _abort();
         // unreachable;
        } else {
         $$pre$phi$iZ2D = $238;$F1$0$i = $239;
        }
       }
       HEAP32[$$pre$phi$iZ2D>>2] = $229;
       $242 = ((($F1$0$i)) + 12|0);
       HEAP32[$242>>2] = $229;
       $243 = ((($229)) + 8|0);
       HEAP32[$243>>2] = $F1$0$i;
       $244 = ((($229)) + 12|0);
       HEAP32[$244>>2] = $232;
      }
      HEAP32[(17896)>>2] = $rsize$0$i$lcssa;
      HEAP32[(17908)>>2] = $152;
     }
     $245 = ((($v$0$i$lcssa)) + 8|0);
     $$0 = $245;
     return ($$0|0);
    }
   } else {
    $nb$0 = $4;
   }
  } else {
   $246 = ($bytes>>>0)>(4294967231);
   if ($246) {
    $nb$0 = -1;
   } else {
    $247 = (($bytes) + 11)|0;
    $248 = $247 & -8;
    $249 = HEAP32[(17892)>>2]|0;
    $250 = ($249|0)==(0);
    if ($250) {
     $nb$0 = $248;
    } else {
     $251 = (0 - ($248))|0;
     $252 = $247 >>> 8;
     $253 = ($252|0)==(0);
     if ($253) {
      $idx$0$i = 0;
     } else {
      $254 = ($248>>>0)>(16777215);
      if ($254) {
       $idx$0$i = 31;
      } else {
       $255 = (($252) + 1048320)|0;
       $256 = $255 >>> 16;
       $257 = $256 & 8;
       $258 = $252 << $257;
       $259 = (($258) + 520192)|0;
       $260 = $259 >>> 16;
       $261 = $260 & 4;
       $262 = $261 | $257;
       $263 = $258 << $261;
       $264 = (($263) + 245760)|0;
       $265 = $264 >>> 16;
       $266 = $265 & 2;
       $267 = $262 | $266;
       $268 = (14 - ($267))|0;
       $269 = $263 << $266;
       $270 = $269 >>> 15;
       $271 = (($268) + ($270))|0;
       $272 = $271 << 1;
       $273 = (($271) + 7)|0;
       $274 = $248 >>> $273;
       $275 = $274 & 1;
       $276 = $275 | $272;
       $idx$0$i = $276;
      }
     }
     $277 = (18192 + ($idx$0$i<<2)|0);
     $278 = HEAP32[$277>>2]|0;
     $279 = ($278|0)==(0|0);
     L123: do {
      if ($279) {
       $rsize$3$i = $251;$t$2$i = 0;$v$3$i = 0;
       label = 86;
      } else {
       $280 = ($idx$0$i|0)==(31);
       $281 = $idx$0$i >>> 1;
       $282 = (25 - ($281))|0;
       $283 = $280 ? 0 : $282;
       $284 = $248 << $283;
       $rsize$0$i5 = $251;$rst$0$i = 0;$sizebits$0$i = $284;$t$0$i4 = $278;$v$0$i6 = 0;
       while(1) {
        $285 = ((($t$0$i4)) + 4|0);
        $286 = HEAP32[$285>>2]|0;
        $287 = $286 & -8;
        $288 = (($287) - ($248))|0;
        $289 = ($288>>>0)<($rsize$0$i5>>>0);
        if ($289) {
         $290 = ($287|0)==($248|0);
         if ($290) {
          $rsize$412$i = $288;$t$411$i = $t$0$i4;$v$413$i = $t$0$i4;
          label = 90;
          break L123;
         } else {
          $rsize$1$i = $288;$v$1$i = $t$0$i4;
         }
        } else {
         $rsize$1$i = $rsize$0$i5;$v$1$i = $v$0$i6;
        }
        $291 = ((($t$0$i4)) + 20|0);
        $292 = HEAP32[$291>>2]|0;
        $293 = $sizebits$0$i >>> 31;
        $294 = (((($t$0$i4)) + 16|0) + ($293<<2)|0);
        $295 = HEAP32[$294>>2]|0;
        $296 = ($292|0)==(0|0);
        $297 = ($292|0)==($295|0);
        $or$cond1$i = $296 | $297;
        $rst$1$i = $or$cond1$i ? $rst$0$i : $292;
        $298 = ($295|0)==(0|0);
        $299 = $298&1;
        $300 = $299 ^ 1;
        $sizebits$0$$i = $sizebits$0$i << $300;
        if ($298) {
         $rsize$3$i = $rsize$1$i;$t$2$i = $rst$1$i;$v$3$i = $v$1$i;
         label = 86;
         break;
        } else {
         $rsize$0$i5 = $rsize$1$i;$rst$0$i = $rst$1$i;$sizebits$0$i = $sizebits$0$$i;$t$0$i4 = $295;$v$0$i6 = $v$1$i;
        }
       }
      }
     } while(0);
     if ((label|0) == 86) {
      $301 = ($t$2$i|0)==(0|0);
      $302 = ($v$3$i|0)==(0|0);
      $or$cond$i = $301 & $302;
      if ($or$cond$i) {
       $303 = 2 << $idx$0$i;
       $304 = (0 - ($303))|0;
       $305 = $303 | $304;
       $306 = $249 & $305;
       $307 = ($306|0)==(0);
       if ($307) {
        $nb$0 = $248;
        break;
       }
       $308 = (0 - ($306))|0;
       $309 = $306 & $308;
       $310 = (($309) + -1)|0;
       $311 = $310 >>> 12;
       $312 = $311 & 16;
       $313 = $310 >>> $312;
       $314 = $313 >>> 5;
       $315 = $314 & 8;
       $316 = $315 | $312;
       $317 = $313 >>> $315;
       $318 = $317 >>> 2;
       $319 = $318 & 4;
       $320 = $316 | $319;
       $321 = $317 >>> $319;
       $322 = $321 >>> 1;
       $323 = $322 & 2;
       $324 = $320 | $323;
       $325 = $321 >>> $323;
       $326 = $325 >>> 1;
       $327 = $326 & 1;
       $328 = $324 | $327;
       $329 = $325 >>> $327;
       $330 = (($328) + ($329))|0;
       $331 = (18192 + ($330<<2)|0);
       $332 = HEAP32[$331>>2]|0;
       $t$4$ph$i = $332;
      } else {
       $t$4$ph$i = $t$2$i;
      }
      $333 = ($t$4$ph$i|0)==(0|0);
      if ($333) {
       $rsize$4$lcssa$i = $rsize$3$i;$v$4$lcssa$i = $v$3$i;
      } else {
       $rsize$412$i = $rsize$3$i;$t$411$i = $t$4$ph$i;$v$413$i = $v$3$i;
       label = 90;
      }
     }
     if ((label|0) == 90) {
      while(1) {
       label = 0;
       $334 = ((($t$411$i)) + 4|0);
       $335 = HEAP32[$334>>2]|0;
       $336 = $335 & -8;
       $337 = (($336) - ($248))|0;
       $338 = ($337>>>0)<($rsize$412$i>>>0);
       $$rsize$4$i = $338 ? $337 : $rsize$412$i;
       $t$4$v$4$i = $338 ? $t$411$i : $v$413$i;
       $339 = ((($t$411$i)) + 16|0);
       $340 = HEAP32[$339>>2]|0;
       $341 = ($340|0)==(0|0);
       if (!($341)) {
        $rsize$412$i = $$rsize$4$i;$t$411$i = $340;$v$413$i = $t$4$v$4$i;
        label = 90;
        continue;
       }
       $342 = ((($t$411$i)) + 20|0);
       $343 = HEAP32[$342>>2]|0;
       $344 = ($343|0)==(0|0);
       if ($344) {
        $rsize$4$lcssa$i = $$rsize$4$i;$v$4$lcssa$i = $t$4$v$4$i;
        break;
       } else {
        $rsize$412$i = $$rsize$4$i;$t$411$i = $343;$v$413$i = $t$4$v$4$i;
        label = 90;
       }
      }
     }
     $345 = ($v$4$lcssa$i|0)==(0|0);
     if ($345) {
      $nb$0 = $248;
     } else {
      $346 = HEAP32[(17896)>>2]|0;
      $347 = (($346) - ($248))|0;
      $348 = ($rsize$4$lcssa$i>>>0)<($347>>>0);
      if ($348) {
       $349 = HEAP32[(17904)>>2]|0;
       $350 = ($v$4$lcssa$i>>>0)<($349>>>0);
       if ($350) {
        _abort();
        // unreachable;
       }
       $351 = (($v$4$lcssa$i) + ($248)|0);
       $352 = ($v$4$lcssa$i>>>0)<($351>>>0);
       if (!($352)) {
        _abort();
        // unreachable;
       }
       $353 = ((($v$4$lcssa$i)) + 24|0);
       $354 = HEAP32[$353>>2]|0;
       $355 = ((($v$4$lcssa$i)) + 12|0);
       $356 = HEAP32[$355>>2]|0;
       $357 = ($356|0)==($v$4$lcssa$i|0);
       do {
        if ($357) {
         $367 = ((($v$4$lcssa$i)) + 20|0);
         $368 = HEAP32[$367>>2]|0;
         $369 = ($368|0)==(0|0);
         if ($369) {
          $370 = ((($v$4$lcssa$i)) + 16|0);
          $371 = HEAP32[$370>>2]|0;
          $372 = ($371|0)==(0|0);
          if ($372) {
           $R$3$i11 = 0;
           break;
          } else {
           $R$1$i9 = $371;$RP$1$i8 = $370;
          }
         } else {
          $R$1$i9 = $368;$RP$1$i8 = $367;
         }
         while(1) {
          $373 = ((($R$1$i9)) + 20|0);
          $374 = HEAP32[$373>>2]|0;
          $375 = ($374|0)==(0|0);
          if (!($375)) {
           $R$1$i9 = $374;$RP$1$i8 = $373;
           continue;
          }
          $376 = ((($R$1$i9)) + 16|0);
          $377 = HEAP32[$376>>2]|0;
          $378 = ($377|0)==(0|0);
          if ($378) {
           $R$1$i9$lcssa = $R$1$i9;$RP$1$i8$lcssa = $RP$1$i8;
           break;
          } else {
           $R$1$i9 = $377;$RP$1$i8 = $376;
          }
         }
         $379 = ($RP$1$i8$lcssa>>>0)<($349>>>0);
         if ($379) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$RP$1$i8$lcssa>>2] = 0;
          $R$3$i11 = $R$1$i9$lcssa;
          break;
         }
        } else {
         $358 = ((($v$4$lcssa$i)) + 8|0);
         $359 = HEAP32[$358>>2]|0;
         $360 = ($359>>>0)<($349>>>0);
         if ($360) {
          _abort();
          // unreachable;
         }
         $361 = ((($359)) + 12|0);
         $362 = HEAP32[$361>>2]|0;
         $363 = ($362|0)==($v$4$lcssa$i|0);
         if (!($363)) {
          _abort();
          // unreachable;
         }
         $364 = ((($356)) + 8|0);
         $365 = HEAP32[$364>>2]|0;
         $366 = ($365|0)==($v$4$lcssa$i|0);
         if ($366) {
          HEAP32[$361>>2] = $356;
          HEAP32[$364>>2] = $359;
          $R$3$i11 = $356;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       } while(0);
       $380 = ($354|0)==(0|0);
       do {
        if (!($380)) {
         $381 = ((($v$4$lcssa$i)) + 28|0);
         $382 = HEAP32[$381>>2]|0;
         $383 = (18192 + ($382<<2)|0);
         $384 = HEAP32[$383>>2]|0;
         $385 = ($v$4$lcssa$i|0)==($384|0);
         if ($385) {
          HEAP32[$383>>2] = $R$3$i11;
          $cond$i12 = ($R$3$i11|0)==(0|0);
          if ($cond$i12) {
           $386 = 1 << $382;
           $387 = $386 ^ -1;
           $388 = HEAP32[(17892)>>2]|0;
           $389 = $388 & $387;
           HEAP32[(17892)>>2] = $389;
           break;
          }
         } else {
          $390 = HEAP32[(17904)>>2]|0;
          $391 = ($354>>>0)<($390>>>0);
          if ($391) {
           _abort();
           // unreachable;
          }
          $392 = ((($354)) + 16|0);
          $393 = HEAP32[$392>>2]|0;
          $394 = ($393|0)==($v$4$lcssa$i|0);
          if ($394) {
           HEAP32[$392>>2] = $R$3$i11;
          } else {
           $395 = ((($354)) + 20|0);
           HEAP32[$395>>2] = $R$3$i11;
          }
          $396 = ($R$3$i11|0)==(0|0);
          if ($396) {
           break;
          }
         }
         $397 = HEAP32[(17904)>>2]|0;
         $398 = ($R$3$i11>>>0)<($397>>>0);
         if ($398) {
          _abort();
          // unreachable;
         }
         $399 = ((($R$3$i11)) + 24|0);
         HEAP32[$399>>2] = $354;
         $400 = ((($v$4$lcssa$i)) + 16|0);
         $401 = HEAP32[$400>>2]|0;
         $402 = ($401|0)==(0|0);
         do {
          if (!($402)) {
           $403 = ($401>>>0)<($397>>>0);
           if ($403) {
            _abort();
            // unreachable;
           } else {
            $404 = ((($R$3$i11)) + 16|0);
            HEAP32[$404>>2] = $401;
            $405 = ((($401)) + 24|0);
            HEAP32[$405>>2] = $R$3$i11;
            break;
           }
          }
         } while(0);
         $406 = ((($v$4$lcssa$i)) + 20|0);
         $407 = HEAP32[$406>>2]|0;
         $408 = ($407|0)==(0|0);
         if (!($408)) {
          $409 = HEAP32[(17904)>>2]|0;
          $410 = ($407>>>0)<($409>>>0);
          if ($410) {
           _abort();
           // unreachable;
          } else {
           $411 = ((($R$3$i11)) + 20|0);
           HEAP32[$411>>2] = $407;
           $412 = ((($407)) + 24|0);
           HEAP32[$412>>2] = $R$3$i11;
           break;
          }
         }
        }
       } while(0);
       $413 = ($rsize$4$lcssa$i>>>0)<(16);
       do {
        if ($413) {
         $414 = (($rsize$4$lcssa$i) + ($248))|0;
         $415 = $414 | 3;
         $416 = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$416>>2] = $415;
         $417 = (($v$4$lcssa$i) + ($414)|0);
         $418 = ((($417)) + 4|0);
         $419 = HEAP32[$418>>2]|0;
         $420 = $419 | 1;
         HEAP32[$418>>2] = $420;
        } else {
         $421 = $248 | 3;
         $422 = ((($v$4$lcssa$i)) + 4|0);
         HEAP32[$422>>2] = $421;
         $423 = $rsize$4$lcssa$i | 1;
         $424 = ((($351)) + 4|0);
         HEAP32[$424>>2] = $423;
         $425 = (($351) + ($rsize$4$lcssa$i)|0);
         HEAP32[$425>>2] = $rsize$4$lcssa$i;
         $426 = $rsize$4$lcssa$i >>> 3;
         $427 = ($rsize$4$lcssa$i>>>0)<(256);
         if ($427) {
          $428 = $426 << 1;
          $429 = (17928 + ($428<<2)|0);
          $430 = HEAP32[4472]|0;
          $431 = 1 << $426;
          $432 = $430 & $431;
          $433 = ($432|0)==(0);
          if ($433) {
           $434 = $430 | $431;
           HEAP32[4472] = $434;
           $$pre$i13 = ((($429)) + 8|0);
           $$pre$phi$i14Z2D = $$pre$i13;$F5$0$i = $429;
          } else {
           $435 = ((($429)) + 8|0);
           $436 = HEAP32[$435>>2]|0;
           $437 = HEAP32[(17904)>>2]|0;
           $438 = ($436>>>0)<($437>>>0);
           if ($438) {
            _abort();
            // unreachable;
           } else {
            $$pre$phi$i14Z2D = $435;$F5$0$i = $436;
           }
          }
          HEAP32[$$pre$phi$i14Z2D>>2] = $351;
          $439 = ((($F5$0$i)) + 12|0);
          HEAP32[$439>>2] = $351;
          $440 = ((($351)) + 8|0);
          HEAP32[$440>>2] = $F5$0$i;
          $441 = ((($351)) + 12|0);
          HEAP32[$441>>2] = $429;
          break;
         }
         $442 = $rsize$4$lcssa$i >>> 8;
         $443 = ($442|0)==(0);
         if ($443) {
          $I7$0$i = 0;
         } else {
          $444 = ($rsize$4$lcssa$i>>>0)>(16777215);
          if ($444) {
           $I7$0$i = 31;
          } else {
           $445 = (($442) + 1048320)|0;
           $446 = $445 >>> 16;
           $447 = $446 & 8;
           $448 = $442 << $447;
           $449 = (($448) + 520192)|0;
           $450 = $449 >>> 16;
           $451 = $450 & 4;
           $452 = $451 | $447;
           $453 = $448 << $451;
           $454 = (($453) + 245760)|0;
           $455 = $454 >>> 16;
           $456 = $455 & 2;
           $457 = $452 | $456;
           $458 = (14 - ($457))|0;
           $459 = $453 << $456;
           $460 = $459 >>> 15;
           $461 = (($458) + ($460))|0;
           $462 = $461 << 1;
           $463 = (($461) + 7)|0;
           $464 = $rsize$4$lcssa$i >>> $463;
           $465 = $464 & 1;
           $466 = $465 | $462;
           $I7$0$i = $466;
          }
         }
         $467 = (18192 + ($I7$0$i<<2)|0);
         $468 = ((($351)) + 28|0);
         HEAP32[$468>>2] = $I7$0$i;
         $469 = ((($351)) + 16|0);
         $470 = ((($469)) + 4|0);
         HEAP32[$470>>2] = 0;
         HEAP32[$469>>2] = 0;
         $471 = HEAP32[(17892)>>2]|0;
         $472 = 1 << $I7$0$i;
         $473 = $471 & $472;
         $474 = ($473|0)==(0);
         if ($474) {
          $475 = $471 | $472;
          HEAP32[(17892)>>2] = $475;
          HEAP32[$467>>2] = $351;
          $476 = ((($351)) + 24|0);
          HEAP32[$476>>2] = $467;
          $477 = ((($351)) + 12|0);
          HEAP32[$477>>2] = $351;
          $478 = ((($351)) + 8|0);
          HEAP32[$478>>2] = $351;
          break;
         }
         $479 = HEAP32[$467>>2]|0;
         $480 = ($I7$0$i|0)==(31);
         $481 = $I7$0$i >>> 1;
         $482 = (25 - ($481))|0;
         $483 = $480 ? 0 : $482;
         $484 = $rsize$4$lcssa$i << $483;
         $K12$0$i = $484;$T$0$i = $479;
         while(1) {
          $485 = ((($T$0$i)) + 4|0);
          $486 = HEAP32[$485>>2]|0;
          $487 = $486 & -8;
          $488 = ($487|0)==($rsize$4$lcssa$i|0);
          if ($488) {
           $T$0$i$lcssa = $T$0$i;
           label = 148;
           break;
          }
          $489 = $K12$0$i >>> 31;
          $490 = (((($T$0$i)) + 16|0) + ($489<<2)|0);
          $491 = $K12$0$i << 1;
          $492 = HEAP32[$490>>2]|0;
          $493 = ($492|0)==(0|0);
          if ($493) {
           $$lcssa157 = $490;$T$0$i$lcssa156 = $T$0$i;
           label = 145;
           break;
          } else {
           $K12$0$i = $491;$T$0$i = $492;
          }
         }
         if ((label|0) == 145) {
          $494 = HEAP32[(17904)>>2]|0;
          $495 = ($$lcssa157>>>0)<($494>>>0);
          if ($495) {
           _abort();
           // unreachable;
          } else {
           HEAP32[$$lcssa157>>2] = $351;
           $496 = ((($351)) + 24|0);
           HEAP32[$496>>2] = $T$0$i$lcssa156;
           $497 = ((($351)) + 12|0);
           HEAP32[$497>>2] = $351;
           $498 = ((($351)) + 8|0);
           HEAP32[$498>>2] = $351;
           break;
          }
         }
         else if ((label|0) == 148) {
          $499 = ((($T$0$i$lcssa)) + 8|0);
          $500 = HEAP32[$499>>2]|0;
          $501 = HEAP32[(17904)>>2]|0;
          $502 = ($500>>>0)>=($501>>>0);
          $not$7$i = ($T$0$i$lcssa>>>0)>=($501>>>0);
          $503 = $502 & $not$7$i;
          if ($503) {
           $504 = ((($500)) + 12|0);
           HEAP32[$504>>2] = $351;
           HEAP32[$499>>2] = $351;
           $505 = ((($351)) + 8|0);
           HEAP32[$505>>2] = $500;
           $506 = ((($351)) + 12|0);
           HEAP32[$506>>2] = $T$0$i$lcssa;
           $507 = ((($351)) + 24|0);
           HEAP32[$507>>2] = 0;
           break;
          } else {
           _abort();
           // unreachable;
          }
         }
        }
       } while(0);
       $508 = ((($v$4$lcssa$i)) + 8|0);
       $$0 = $508;
       return ($$0|0);
      } else {
       $nb$0 = $248;
      }
     }
    }
   }
  }
 } while(0);
 $509 = HEAP32[(17896)>>2]|0;
 $510 = ($509>>>0)<($nb$0>>>0);
 if (!($510)) {
  $511 = (($509) - ($nb$0))|0;
  $512 = HEAP32[(17908)>>2]|0;
  $513 = ($511>>>0)>(15);
  if ($513) {
   $514 = (($512) + ($nb$0)|0);
   HEAP32[(17908)>>2] = $514;
   HEAP32[(17896)>>2] = $511;
   $515 = $511 | 1;
   $516 = ((($514)) + 4|0);
   HEAP32[$516>>2] = $515;
   $517 = (($514) + ($511)|0);
   HEAP32[$517>>2] = $511;
   $518 = $nb$0 | 3;
   $519 = ((($512)) + 4|0);
   HEAP32[$519>>2] = $518;
  } else {
   HEAP32[(17896)>>2] = 0;
   HEAP32[(17908)>>2] = 0;
   $520 = $509 | 3;
   $521 = ((($512)) + 4|0);
   HEAP32[$521>>2] = $520;
   $522 = (($512) + ($509)|0);
   $523 = ((($522)) + 4|0);
   $524 = HEAP32[$523>>2]|0;
   $525 = $524 | 1;
   HEAP32[$523>>2] = $525;
  }
  $526 = ((($512)) + 8|0);
  $$0 = $526;
  return ($$0|0);
 }
 $527 = HEAP32[(17900)>>2]|0;
 $528 = ($527>>>0)>($nb$0>>>0);
 if ($528) {
  $529 = (($527) - ($nb$0))|0;
  HEAP32[(17900)>>2] = $529;
  $530 = HEAP32[(17912)>>2]|0;
  $531 = (($530) + ($nb$0)|0);
  HEAP32[(17912)>>2] = $531;
  $532 = $529 | 1;
  $533 = ((($531)) + 4|0);
  HEAP32[$533>>2] = $532;
  $534 = $nb$0 | 3;
  $535 = ((($530)) + 4|0);
  HEAP32[$535>>2] = $534;
  $536 = ((($530)) + 8|0);
  $$0 = $536;
  return ($$0|0);
 }
 $537 = HEAP32[4590]|0;
 $538 = ($537|0)==(0);
 do {
  if ($538) {
   $539 = (_sysconf(30)|0);
   $540 = (($539) + -1)|0;
   $541 = $540 & $539;
   $542 = ($541|0)==(0);
   if ($542) {
    HEAP32[(18368)>>2] = $539;
    HEAP32[(18364)>>2] = $539;
    HEAP32[(18372)>>2] = -1;
    HEAP32[(18376)>>2] = -1;
    HEAP32[(18380)>>2] = 0;
    HEAP32[(18332)>>2] = 0;
    $543 = (_time((0|0))|0);
    $544 = $543 & -16;
    $545 = $544 ^ 1431655768;
    HEAP32[4590] = $545;
    break;
   } else {
    _abort();
    // unreachable;
   }
  }
 } while(0);
 $546 = (($nb$0) + 48)|0;
 $547 = HEAP32[(18368)>>2]|0;
 $548 = (($nb$0) + 47)|0;
 $549 = (($547) + ($548))|0;
 $550 = (0 - ($547))|0;
 $551 = $549 & $550;
 $552 = ($551>>>0)>($nb$0>>>0);
 if (!($552)) {
  $$0 = 0;
  return ($$0|0);
 }
 $553 = HEAP32[(18328)>>2]|0;
 $554 = ($553|0)==(0);
 if (!($554)) {
  $555 = HEAP32[(18320)>>2]|0;
  $556 = (($555) + ($551))|0;
  $557 = ($556>>>0)<=($555>>>0);
  $558 = ($556>>>0)>($553>>>0);
  $or$cond1$i16 = $557 | $558;
  if ($or$cond1$i16) {
   $$0 = 0;
   return ($$0|0);
  }
 }
 $559 = HEAP32[(18332)>>2]|0;
 $560 = $559 & 4;
 $561 = ($560|0)==(0);
 L257: do {
  if ($561) {
   $562 = HEAP32[(17912)>>2]|0;
   $563 = ($562|0)==(0|0);
   L259: do {
    if ($563) {
     label = 173;
    } else {
     $sp$0$i$i = (18336);
     while(1) {
      $564 = HEAP32[$sp$0$i$i>>2]|0;
      $565 = ($564>>>0)>($562>>>0);
      if (!($565)) {
       $566 = ((($sp$0$i$i)) + 4|0);
       $567 = HEAP32[$566>>2]|0;
       $568 = (($564) + ($567)|0);
       $569 = ($568>>>0)>($562>>>0);
       if ($569) {
        $$lcssa153 = $sp$0$i$i;$$lcssa155 = $566;
        break;
       }
      }
      $570 = ((($sp$0$i$i)) + 8|0);
      $571 = HEAP32[$570>>2]|0;
      $572 = ($571|0)==(0|0);
      if ($572) {
       label = 173;
       break L259;
      } else {
       $sp$0$i$i = $571;
      }
     }
     $595 = HEAP32[(17900)>>2]|0;
     $596 = (($549) - ($595))|0;
     $597 = $596 & $550;
     $598 = ($597>>>0)<(2147483647);
     if ($598) {
      $599 = (_sbrk(($597|0))|0);
      $600 = HEAP32[$$lcssa153>>2]|0;
      $601 = HEAP32[$$lcssa155>>2]|0;
      $602 = (($600) + ($601)|0);
      $603 = ($599|0)==($602|0);
      if ($603) {
       $604 = ($599|0)==((-1)|0);
       if (!($604)) {
        $tbase$746$i = $599;$tsize$745$i = $597;
        label = 193;
        break L257;
       }
      } else {
       $br$2$ph$i = $599;$ssize$2$ph$i = $597;
       label = 183;
      }
     }
    }
   } while(0);
   do {
    if ((label|0) == 173) {
     $573 = (_sbrk(0)|0);
     $574 = ($573|0)==((-1)|0);
     if (!($574)) {
      $575 = $573;
      $576 = HEAP32[(18364)>>2]|0;
      $577 = (($576) + -1)|0;
      $578 = $577 & $575;
      $579 = ($578|0)==(0);
      if ($579) {
       $ssize$0$i = $551;
      } else {
       $580 = (($577) + ($575))|0;
       $581 = (0 - ($576))|0;
       $582 = $580 & $581;
       $583 = (($551) - ($575))|0;
       $584 = (($583) + ($582))|0;
       $ssize$0$i = $584;
      }
      $585 = HEAP32[(18320)>>2]|0;
      $586 = (($585) + ($ssize$0$i))|0;
      $587 = ($ssize$0$i>>>0)>($nb$0>>>0);
      $588 = ($ssize$0$i>>>0)<(2147483647);
      $or$cond$i17 = $587 & $588;
      if ($or$cond$i17) {
       $589 = HEAP32[(18328)>>2]|0;
       $590 = ($589|0)==(0);
       if (!($590)) {
        $591 = ($586>>>0)<=($585>>>0);
        $592 = ($586>>>0)>($589>>>0);
        $or$cond2$i = $591 | $592;
        if ($or$cond2$i) {
         break;
        }
       }
       $593 = (_sbrk(($ssize$0$i|0))|0);
       $594 = ($593|0)==($573|0);
       if ($594) {
        $tbase$746$i = $573;$tsize$745$i = $ssize$0$i;
        label = 193;
        break L257;
       } else {
        $br$2$ph$i = $593;$ssize$2$ph$i = $ssize$0$i;
        label = 183;
       }
      }
     }
    }
   } while(0);
   L279: do {
    if ((label|0) == 183) {
     $605 = (0 - ($ssize$2$ph$i))|0;
     $606 = ($br$2$ph$i|0)!=((-1)|0);
     $607 = ($ssize$2$ph$i>>>0)<(2147483647);
     $or$cond7$i = $607 & $606;
     $608 = ($546>>>0)>($ssize$2$ph$i>>>0);
     $or$cond8$i = $608 & $or$cond7$i;
     do {
      if ($or$cond8$i) {
       $609 = HEAP32[(18368)>>2]|0;
       $610 = (($548) - ($ssize$2$ph$i))|0;
       $611 = (($610) + ($609))|0;
       $612 = (0 - ($609))|0;
       $613 = $611 & $612;
       $614 = ($613>>>0)<(2147483647);
       if ($614) {
        $615 = (_sbrk(($613|0))|0);
        $616 = ($615|0)==((-1)|0);
        if ($616) {
         (_sbrk(($605|0))|0);
         break L279;
        } else {
         $617 = (($613) + ($ssize$2$ph$i))|0;
         $ssize$5$i = $617;
         break;
        }
       } else {
        $ssize$5$i = $ssize$2$ph$i;
       }
      } else {
       $ssize$5$i = $ssize$2$ph$i;
      }
     } while(0);
     $618 = ($br$2$ph$i|0)==((-1)|0);
     if (!($618)) {
      $tbase$746$i = $br$2$ph$i;$tsize$745$i = $ssize$5$i;
      label = 193;
      break L257;
     }
    }
   } while(0);
   $619 = HEAP32[(18332)>>2]|0;
   $620 = $619 | 4;
   HEAP32[(18332)>>2] = $620;
   label = 190;
  } else {
   label = 190;
  }
 } while(0);
 if ((label|0) == 190) {
  $621 = ($551>>>0)<(2147483647);
  if ($621) {
   $622 = (_sbrk(($551|0))|0);
   $623 = (_sbrk(0)|0);
   $624 = ($622|0)!=((-1)|0);
   $625 = ($623|0)!=((-1)|0);
   $or$cond5$i = $624 & $625;
   $626 = ($622>>>0)<($623>>>0);
   $or$cond10$i = $626 & $or$cond5$i;
   if ($or$cond10$i) {
    $627 = $623;
    $628 = $622;
    $629 = (($627) - ($628))|0;
    $630 = (($nb$0) + 40)|0;
    $$not$i = ($629>>>0)>($630>>>0);
    if ($$not$i) {
     $tbase$746$i = $622;$tsize$745$i = $629;
     label = 193;
    }
   }
  }
 }
 if ((label|0) == 193) {
  $631 = HEAP32[(18320)>>2]|0;
  $632 = (($631) + ($tsize$745$i))|0;
  HEAP32[(18320)>>2] = $632;
  $633 = HEAP32[(18324)>>2]|0;
  $634 = ($632>>>0)>($633>>>0);
  if ($634) {
   HEAP32[(18324)>>2] = $632;
  }
  $635 = HEAP32[(17912)>>2]|0;
  $636 = ($635|0)==(0|0);
  do {
   if ($636) {
    $637 = HEAP32[(17904)>>2]|0;
    $638 = ($637|0)==(0|0);
    $639 = ($tbase$746$i>>>0)<($637>>>0);
    $or$cond11$i = $638 | $639;
    if ($or$cond11$i) {
     HEAP32[(17904)>>2] = $tbase$746$i;
    }
    HEAP32[(18336)>>2] = $tbase$746$i;
    HEAP32[(18340)>>2] = $tsize$745$i;
    HEAP32[(18348)>>2] = 0;
    $640 = HEAP32[4590]|0;
    HEAP32[(17924)>>2] = $640;
    HEAP32[(17920)>>2] = -1;
    $i$01$i$i = 0;
    while(1) {
     $641 = $i$01$i$i << 1;
     $642 = (17928 + ($641<<2)|0);
     $643 = ((($642)) + 12|0);
     HEAP32[$643>>2] = $642;
     $644 = ((($642)) + 8|0);
     HEAP32[$644>>2] = $642;
     $645 = (($i$01$i$i) + 1)|0;
     $exitcond$i$i = ($645|0)==(32);
     if ($exitcond$i$i) {
      break;
     } else {
      $i$01$i$i = $645;
     }
    }
    $646 = (($tsize$745$i) + -40)|0;
    $647 = ((($tbase$746$i)) + 8|0);
    $648 = $647;
    $649 = $648 & 7;
    $650 = ($649|0)==(0);
    $651 = (0 - ($648))|0;
    $652 = $651 & 7;
    $653 = $650 ? 0 : $652;
    $654 = (($tbase$746$i) + ($653)|0);
    $655 = (($646) - ($653))|0;
    HEAP32[(17912)>>2] = $654;
    HEAP32[(17900)>>2] = $655;
    $656 = $655 | 1;
    $657 = ((($654)) + 4|0);
    HEAP32[$657>>2] = $656;
    $658 = (($654) + ($655)|0);
    $659 = ((($658)) + 4|0);
    HEAP32[$659>>2] = 40;
    $660 = HEAP32[(18376)>>2]|0;
    HEAP32[(17916)>>2] = $660;
   } else {
    $sp$068$i = (18336);
    while(1) {
     $661 = HEAP32[$sp$068$i>>2]|0;
     $662 = ((($sp$068$i)) + 4|0);
     $663 = HEAP32[$662>>2]|0;
     $664 = (($661) + ($663)|0);
     $665 = ($tbase$746$i|0)==($664|0);
     if ($665) {
      $$lcssa147 = $661;$$lcssa149 = $662;$$lcssa151 = $663;$sp$068$i$lcssa = $sp$068$i;
      label = 203;
      break;
     }
     $666 = ((($sp$068$i)) + 8|0);
     $667 = HEAP32[$666>>2]|0;
     $668 = ($667|0)==(0|0);
     if ($668) {
      break;
     } else {
      $sp$068$i = $667;
     }
    }
    if ((label|0) == 203) {
     $669 = ((($sp$068$i$lcssa)) + 12|0);
     $670 = HEAP32[$669>>2]|0;
     $671 = $670 & 8;
     $672 = ($671|0)==(0);
     if ($672) {
      $673 = ($635>>>0)>=($$lcssa147>>>0);
      $674 = ($635>>>0)<($tbase$746$i>>>0);
      $or$cond48$i = $674 & $673;
      if ($or$cond48$i) {
       $675 = (($$lcssa151) + ($tsize$745$i))|0;
       HEAP32[$$lcssa149>>2] = $675;
       $676 = HEAP32[(17900)>>2]|0;
       $677 = ((($635)) + 8|0);
       $678 = $677;
       $679 = $678 & 7;
       $680 = ($679|0)==(0);
       $681 = (0 - ($678))|0;
       $682 = $681 & 7;
       $683 = $680 ? 0 : $682;
       $684 = (($635) + ($683)|0);
       $685 = (($tsize$745$i) - ($683))|0;
       $686 = (($685) + ($676))|0;
       HEAP32[(17912)>>2] = $684;
       HEAP32[(17900)>>2] = $686;
       $687 = $686 | 1;
       $688 = ((($684)) + 4|0);
       HEAP32[$688>>2] = $687;
       $689 = (($684) + ($686)|0);
       $690 = ((($689)) + 4|0);
       HEAP32[$690>>2] = 40;
       $691 = HEAP32[(18376)>>2]|0;
       HEAP32[(17916)>>2] = $691;
       break;
      }
     }
    }
    $692 = HEAP32[(17904)>>2]|0;
    $693 = ($tbase$746$i>>>0)<($692>>>0);
    if ($693) {
     HEAP32[(17904)>>2] = $tbase$746$i;
     $757 = $tbase$746$i;
    } else {
     $757 = $692;
    }
    $694 = (($tbase$746$i) + ($tsize$745$i)|0);
    $sp$167$i = (18336);
    while(1) {
     $695 = HEAP32[$sp$167$i>>2]|0;
     $696 = ($695|0)==($694|0);
     if ($696) {
      $$lcssa144 = $sp$167$i;$sp$167$i$lcssa = $sp$167$i;
      label = 211;
      break;
     }
     $697 = ((($sp$167$i)) + 8|0);
     $698 = HEAP32[$697>>2]|0;
     $699 = ($698|0)==(0|0);
     if ($699) {
      $sp$0$i$i$i = (18336);
      break;
     } else {
      $sp$167$i = $698;
     }
    }
    if ((label|0) == 211) {
     $700 = ((($sp$167$i$lcssa)) + 12|0);
     $701 = HEAP32[$700>>2]|0;
     $702 = $701 & 8;
     $703 = ($702|0)==(0);
     if ($703) {
      HEAP32[$$lcssa144>>2] = $tbase$746$i;
      $704 = ((($sp$167$i$lcssa)) + 4|0);
      $705 = HEAP32[$704>>2]|0;
      $706 = (($705) + ($tsize$745$i))|0;
      HEAP32[$704>>2] = $706;
      $707 = ((($tbase$746$i)) + 8|0);
      $708 = $707;
      $709 = $708 & 7;
      $710 = ($709|0)==(0);
      $711 = (0 - ($708))|0;
      $712 = $711 & 7;
      $713 = $710 ? 0 : $712;
      $714 = (($tbase$746$i) + ($713)|0);
      $715 = ((($694)) + 8|0);
      $716 = $715;
      $717 = $716 & 7;
      $718 = ($717|0)==(0);
      $719 = (0 - ($716))|0;
      $720 = $719 & 7;
      $721 = $718 ? 0 : $720;
      $722 = (($694) + ($721)|0);
      $723 = $722;
      $724 = $714;
      $725 = (($723) - ($724))|0;
      $726 = (($714) + ($nb$0)|0);
      $727 = (($725) - ($nb$0))|0;
      $728 = $nb$0 | 3;
      $729 = ((($714)) + 4|0);
      HEAP32[$729>>2] = $728;
      $730 = ($722|0)==($635|0);
      do {
       if ($730) {
        $731 = HEAP32[(17900)>>2]|0;
        $732 = (($731) + ($727))|0;
        HEAP32[(17900)>>2] = $732;
        HEAP32[(17912)>>2] = $726;
        $733 = $732 | 1;
        $734 = ((($726)) + 4|0);
        HEAP32[$734>>2] = $733;
       } else {
        $735 = HEAP32[(17908)>>2]|0;
        $736 = ($722|0)==($735|0);
        if ($736) {
         $737 = HEAP32[(17896)>>2]|0;
         $738 = (($737) + ($727))|0;
         HEAP32[(17896)>>2] = $738;
         HEAP32[(17908)>>2] = $726;
         $739 = $738 | 1;
         $740 = ((($726)) + 4|0);
         HEAP32[$740>>2] = $739;
         $741 = (($726) + ($738)|0);
         HEAP32[$741>>2] = $738;
         break;
        }
        $742 = ((($722)) + 4|0);
        $743 = HEAP32[$742>>2]|0;
        $744 = $743 & 3;
        $745 = ($744|0)==(1);
        if ($745) {
         $746 = $743 & -8;
         $747 = $743 >>> 3;
         $748 = ($743>>>0)<(256);
         L331: do {
          if ($748) {
           $749 = ((($722)) + 8|0);
           $750 = HEAP32[$749>>2]|0;
           $751 = ((($722)) + 12|0);
           $752 = HEAP32[$751>>2]|0;
           $753 = $747 << 1;
           $754 = (17928 + ($753<<2)|0);
           $755 = ($750|0)==($754|0);
           do {
            if (!($755)) {
             $756 = ($750>>>0)<($757>>>0);
             if ($756) {
              _abort();
              // unreachable;
             }
             $758 = ((($750)) + 12|0);
             $759 = HEAP32[$758>>2]|0;
             $760 = ($759|0)==($722|0);
             if ($760) {
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $761 = ($752|0)==($750|0);
           if ($761) {
            $762 = 1 << $747;
            $763 = $762 ^ -1;
            $764 = HEAP32[4472]|0;
            $765 = $764 & $763;
            HEAP32[4472] = $765;
            break;
           }
           $766 = ($752|0)==($754|0);
           do {
            if ($766) {
             $$pre9$i$i = ((($752)) + 8|0);
             $$pre$phi10$i$iZ2D = $$pre9$i$i;
            } else {
             $767 = ($752>>>0)<($757>>>0);
             if ($767) {
              _abort();
              // unreachable;
             }
             $768 = ((($752)) + 8|0);
             $769 = HEAP32[$768>>2]|0;
             $770 = ($769|0)==($722|0);
             if ($770) {
              $$pre$phi10$i$iZ2D = $768;
              break;
             }
             _abort();
             // unreachable;
            }
           } while(0);
           $771 = ((($750)) + 12|0);
           HEAP32[$771>>2] = $752;
           HEAP32[$$pre$phi10$i$iZ2D>>2] = $750;
          } else {
           $772 = ((($722)) + 24|0);
           $773 = HEAP32[$772>>2]|0;
           $774 = ((($722)) + 12|0);
           $775 = HEAP32[$774>>2]|0;
           $776 = ($775|0)==($722|0);
           do {
            if ($776) {
             $786 = ((($722)) + 16|0);
             $787 = ((($786)) + 4|0);
             $788 = HEAP32[$787>>2]|0;
             $789 = ($788|0)==(0|0);
             if ($789) {
              $790 = HEAP32[$786>>2]|0;
              $791 = ($790|0)==(0|0);
              if ($791) {
               $R$3$i$i = 0;
               break;
              } else {
               $R$1$i$i = $790;$RP$1$i$i = $786;
              }
             } else {
              $R$1$i$i = $788;$RP$1$i$i = $787;
             }
             while(1) {
              $792 = ((($R$1$i$i)) + 20|0);
              $793 = HEAP32[$792>>2]|0;
              $794 = ($793|0)==(0|0);
              if (!($794)) {
               $R$1$i$i = $793;$RP$1$i$i = $792;
               continue;
              }
              $795 = ((($R$1$i$i)) + 16|0);
              $796 = HEAP32[$795>>2]|0;
              $797 = ($796|0)==(0|0);
              if ($797) {
               $R$1$i$i$lcssa = $R$1$i$i;$RP$1$i$i$lcssa = $RP$1$i$i;
               break;
              } else {
               $R$1$i$i = $796;$RP$1$i$i = $795;
              }
             }
             $798 = ($RP$1$i$i$lcssa>>>0)<($757>>>0);
             if ($798) {
              _abort();
              // unreachable;
             } else {
              HEAP32[$RP$1$i$i$lcssa>>2] = 0;
              $R$3$i$i = $R$1$i$i$lcssa;
              break;
             }
            } else {
             $777 = ((($722)) + 8|0);
             $778 = HEAP32[$777>>2]|0;
             $779 = ($778>>>0)<($757>>>0);
             if ($779) {
              _abort();
              // unreachable;
             }
             $780 = ((($778)) + 12|0);
             $781 = HEAP32[$780>>2]|0;
             $782 = ($781|0)==($722|0);
             if (!($782)) {
              _abort();
              // unreachable;
             }
             $783 = ((($775)) + 8|0);
             $784 = HEAP32[$783>>2]|0;
             $785 = ($784|0)==($722|0);
             if ($785) {
              HEAP32[$780>>2] = $775;
              HEAP32[$783>>2] = $778;
              $R$3$i$i = $775;
              break;
             } else {
              _abort();
              // unreachable;
             }
            }
           } while(0);
           $799 = ($773|0)==(0|0);
           if ($799) {
            break;
           }
           $800 = ((($722)) + 28|0);
           $801 = HEAP32[$800>>2]|0;
           $802 = (18192 + ($801<<2)|0);
           $803 = HEAP32[$802>>2]|0;
           $804 = ($722|0)==($803|0);
           do {
            if ($804) {
             HEAP32[$802>>2] = $R$3$i$i;
             $cond$i$i = ($R$3$i$i|0)==(0|0);
             if (!($cond$i$i)) {
              break;
             }
             $805 = 1 << $801;
             $806 = $805 ^ -1;
             $807 = HEAP32[(17892)>>2]|0;
             $808 = $807 & $806;
             HEAP32[(17892)>>2] = $808;
             break L331;
            } else {
             $809 = HEAP32[(17904)>>2]|0;
             $810 = ($773>>>0)<($809>>>0);
             if ($810) {
              _abort();
              // unreachable;
             }
             $811 = ((($773)) + 16|0);
             $812 = HEAP32[$811>>2]|0;
             $813 = ($812|0)==($722|0);
             if ($813) {
              HEAP32[$811>>2] = $R$3$i$i;
             } else {
              $814 = ((($773)) + 20|0);
              HEAP32[$814>>2] = $R$3$i$i;
             }
             $815 = ($R$3$i$i|0)==(0|0);
             if ($815) {
              break L331;
             }
            }
           } while(0);
           $816 = HEAP32[(17904)>>2]|0;
           $817 = ($R$3$i$i>>>0)<($816>>>0);
           if ($817) {
            _abort();
            // unreachable;
           }
           $818 = ((($R$3$i$i)) + 24|0);
           HEAP32[$818>>2] = $773;
           $819 = ((($722)) + 16|0);
           $820 = HEAP32[$819>>2]|0;
           $821 = ($820|0)==(0|0);
           do {
            if (!($821)) {
             $822 = ($820>>>0)<($816>>>0);
             if ($822) {
              _abort();
              // unreachable;
             } else {
              $823 = ((($R$3$i$i)) + 16|0);
              HEAP32[$823>>2] = $820;
              $824 = ((($820)) + 24|0);
              HEAP32[$824>>2] = $R$3$i$i;
              break;
             }
            }
           } while(0);
           $825 = ((($819)) + 4|0);
           $826 = HEAP32[$825>>2]|0;
           $827 = ($826|0)==(0|0);
           if ($827) {
            break;
           }
           $828 = HEAP32[(17904)>>2]|0;
           $829 = ($826>>>0)<($828>>>0);
           if ($829) {
            _abort();
            // unreachable;
           } else {
            $830 = ((($R$3$i$i)) + 20|0);
            HEAP32[$830>>2] = $826;
            $831 = ((($826)) + 24|0);
            HEAP32[$831>>2] = $R$3$i$i;
            break;
           }
          }
         } while(0);
         $832 = (($722) + ($746)|0);
         $833 = (($746) + ($727))|0;
         $oldfirst$0$i$i = $832;$qsize$0$i$i = $833;
        } else {
         $oldfirst$0$i$i = $722;$qsize$0$i$i = $727;
        }
        $834 = ((($oldfirst$0$i$i)) + 4|0);
        $835 = HEAP32[$834>>2]|0;
        $836 = $835 & -2;
        HEAP32[$834>>2] = $836;
        $837 = $qsize$0$i$i | 1;
        $838 = ((($726)) + 4|0);
        HEAP32[$838>>2] = $837;
        $839 = (($726) + ($qsize$0$i$i)|0);
        HEAP32[$839>>2] = $qsize$0$i$i;
        $840 = $qsize$0$i$i >>> 3;
        $841 = ($qsize$0$i$i>>>0)<(256);
        if ($841) {
         $842 = $840 << 1;
         $843 = (17928 + ($842<<2)|0);
         $844 = HEAP32[4472]|0;
         $845 = 1 << $840;
         $846 = $844 & $845;
         $847 = ($846|0)==(0);
         do {
          if ($847) {
           $848 = $844 | $845;
           HEAP32[4472] = $848;
           $$pre$i16$i = ((($843)) + 8|0);
           $$pre$phi$i17$iZ2D = $$pre$i16$i;$F4$0$i$i = $843;
          } else {
           $849 = ((($843)) + 8|0);
           $850 = HEAP32[$849>>2]|0;
           $851 = HEAP32[(17904)>>2]|0;
           $852 = ($850>>>0)<($851>>>0);
           if (!($852)) {
            $$pre$phi$i17$iZ2D = $849;$F4$0$i$i = $850;
            break;
           }
           _abort();
           // unreachable;
          }
         } while(0);
         HEAP32[$$pre$phi$i17$iZ2D>>2] = $726;
         $853 = ((($F4$0$i$i)) + 12|0);
         HEAP32[$853>>2] = $726;
         $854 = ((($726)) + 8|0);
         HEAP32[$854>>2] = $F4$0$i$i;
         $855 = ((($726)) + 12|0);
         HEAP32[$855>>2] = $843;
         break;
        }
        $856 = $qsize$0$i$i >>> 8;
        $857 = ($856|0)==(0);
        do {
         if ($857) {
          $I7$0$i$i = 0;
         } else {
          $858 = ($qsize$0$i$i>>>0)>(16777215);
          if ($858) {
           $I7$0$i$i = 31;
           break;
          }
          $859 = (($856) + 1048320)|0;
          $860 = $859 >>> 16;
          $861 = $860 & 8;
          $862 = $856 << $861;
          $863 = (($862) + 520192)|0;
          $864 = $863 >>> 16;
          $865 = $864 & 4;
          $866 = $865 | $861;
          $867 = $862 << $865;
          $868 = (($867) + 245760)|0;
          $869 = $868 >>> 16;
          $870 = $869 & 2;
          $871 = $866 | $870;
          $872 = (14 - ($871))|0;
          $873 = $867 << $870;
          $874 = $873 >>> 15;
          $875 = (($872) + ($874))|0;
          $876 = $875 << 1;
          $877 = (($875) + 7)|0;
          $878 = $qsize$0$i$i >>> $877;
          $879 = $878 & 1;
          $880 = $879 | $876;
          $I7$0$i$i = $880;
         }
        } while(0);
        $881 = (18192 + ($I7$0$i$i<<2)|0);
        $882 = ((($726)) + 28|0);
        HEAP32[$882>>2] = $I7$0$i$i;
        $883 = ((($726)) + 16|0);
        $884 = ((($883)) + 4|0);
        HEAP32[$884>>2] = 0;
        HEAP32[$883>>2] = 0;
        $885 = HEAP32[(17892)>>2]|0;
        $886 = 1 << $I7$0$i$i;
        $887 = $885 & $886;
        $888 = ($887|0)==(0);
        if ($888) {
         $889 = $885 | $886;
         HEAP32[(17892)>>2] = $889;
         HEAP32[$881>>2] = $726;
         $890 = ((($726)) + 24|0);
         HEAP32[$890>>2] = $881;
         $891 = ((($726)) + 12|0);
         HEAP32[$891>>2] = $726;
         $892 = ((($726)) + 8|0);
         HEAP32[$892>>2] = $726;
         break;
        }
        $893 = HEAP32[$881>>2]|0;
        $894 = ($I7$0$i$i|0)==(31);
        $895 = $I7$0$i$i >>> 1;
        $896 = (25 - ($895))|0;
        $897 = $894 ? 0 : $896;
        $898 = $qsize$0$i$i << $897;
        $K8$0$i$i = $898;$T$0$i18$i = $893;
        while(1) {
         $899 = ((($T$0$i18$i)) + 4|0);
         $900 = HEAP32[$899>>2]|0;
         $901 = $900 & -8;
         $902 = ($901|0)==($qsize$0$i$i|0);
         if ($902) {
          $T$0$i18$i$lcssa = $T$0$i18$i;
          label = 281;
          break;
         }
         $903 = $K8$0$i$i >>> 31;
         $904 = (((($T$0$i18$i)) + 16|0) + ($903<<2)|0);
         $905 = $K8$0$i$i << 1;
         $906 = HEAP32[$904>>2]|0;
         $907 = ($906|0)==(0|0);
         if ($907) {
          $$lcssa = $904;$T$0$i18$i$lcssa139 = $T$0$i18$i;
          label = 278;
          break;
         } else {
          $K8$0$i$i = $905;$T$0$i18$i = $906;
         }
        }
        if ((label|0) == 278) {
         $908 = HEAP32[(17904)>>2]|0;
         $909 = ($$lcssa>>>0)<($908>>>0);
         if ($909) {
          _abort();
          // unreachable;
         } else {
          HEAP32[$$lcssa>>2] = $726;
          $910 = ((($726)) + 24|0);
          HEAP32[$910>>2] = $T$0$i18$i$lcssa139;
          $911 = ((($726)) + 12|0);
          HEAP32[$911>>2] = $726;
          $912 = ((($726)) + 8|0);
          HEAP32[$912>>2] = $726;
          break;
         }
        }
        else if ((label|0) == 281) {
         $913 = ((($T$0$i18$i$lcssa)) + 8|0);
         $914 = HEAP32[$913>>2]|0;
         $915 = HEAP32[(17904)>>2]|0;
         $916 = ($914>>>0)>=($915>>>0);
         $not$$i20$i = ($T$0$i18$i$lcssa>>>0)>=($915>>>0);
         $917 = $916 & $not$$i20$i;
         if ($917) {
          $918 = ((($914)) + 12|0);
          HEAP32[$918>>2] = $726;
          HEAP32[$913>>2] = $726;
          $919 = ((($726)) + 8|0);
          HEAP32[$919>>2] = $914;
          $920 = ((($726)) + 12|0);
          HEAP32[$920>>2] = $T$0$i18$i$lcssa;
          $921 = ((($726)) + 24|0);
          HEAP32[$921>>2] = 0;
          break;
         } else {
          _abort();
          // unreachable;
         }
        }
       }
      } while(0);
      $1052 = ((($714)) + 8|0);
      $$0 = $1052;
      return ($$0|0);
     } else {
      $sp$0$i$i$i = (18336);
     }
    }
    while(1) {
     $922 = HEAP32[$sp$0$i$i$i>>2]|0;
     $923 = ($922>>>0)>($635>>>0);
     if (!($923)) {
      $924 = ((($sp$0$i$i$i)) + 4|0);
      $925 = HEAP32[$924>>2]|0;
      $926 = (($922) + ($925)|0);
      $927 = ($926>>>0)>($635>>>0);
      if ($927) {
       $$lcssa142 = $926;
       break;
      }
     }
     $928 = ((($sp$0$i$i$i)) + 8|0);
     $929 = HEAP32[$928>>2]|0;
     $sp$0$i$i$i = $929;
    }
    $930 = ((($$lcssa142)) + -47|0);
    $931 = ((($930)) + 8|0);
    $932 = $931;
    $933 = $932 & 7;
    $934 = ($933|0)==(0);
    $935 = (0 - ($932))|0;
    $936 = $935 & 7;
    $937 = $934 ? 0 : $936;
    $938 = (($930) + ($937)|0);
    $939 = ((($635)) + 16|0);
    $940 = ($938>>>0)<($939>>>0);
    $941 = $940 ? $635 : $938;
    $942 = ((($941)) + 8|0);
    $943 = ((($941)) + 24|0);
    $944 = (($tsize$745$i) + -40)|0;
    $945 = ((($tbase$746$i)) + 8|0);
    $946 = $945;
    $947 = $946 & 7;
    $948 = ($947|0)==(0);
    $949 = (0 - ($946))|0;
    $950 = $949 & 7;
    $951 = $948 ? 0 : $950;
    $952 = (($tbase$746$i) + ($951)|0);
    $953 = (($944) - ($951))|0;
    HEAP32[(17912)>>2] = $952;
    HEAP32[(17900)>>2] = $953;
    $954 = $953 | 1;
    $955 = ((($952)) + 4|0);
    HEAP32[$955>>2] = $954;
    $956 = (($952) + ($953)|0);
    $957 = ((($956)) + 4|0);
    HEAP32[$957>>2] = 40;
    $958 = HEAP32[(18376)>>2]|0;
    HEAP32[(17916)>>2] = $958;
    $959 = ((($941)) + 4|0);
    HEAP32[$959>>2] = 27;
    ;HEAP32[$942>>2]=HEAP32[(18336)>>2]|0;HEAP32[$942+4>>2]=HEAP32[(18336)+4>>2]|0;HEAP32[$942+8>>2]=HEAP32[(18336)+8>>2]|0;HEAP32[$942+12>>2]=HEAP32[(18336)+12>>2]|0;
    HEAP32[(18336)>>2] = $tbase$746$i;
    HEAP32[(18340)>>2] = $tsize$745$i;
    HEAP32[(18348)>>2] = 0;
    HEAP32[(18344)>>2] = $942;
    $p$0$i$i = $943;
    while(1) {
     $960 = ((($p$0$i$i)) + 4|0);
     HEAP32[$960>>2] = 7;
     $961 = ((($960)) + 4|0);
     $962 = ($961>>>0)<($$lcssa142>>>0);
     if ($962) {
      $p$0$i$i = $960;
     } else {
      break;
     }
    }
    $963 = ($941|0)==($635|0);
    if (!($963)) {
     $964 = $941;
     $965 = $635;
     $966 = (($964) - ($965))|0;
     $967 = HEAP32[$959>>2]|0;
     $968 = $967 & -2;
     HEAP32[$959>>2] = $968;
     $969 = $966 | 1;
     $970 = ((($635)) + 4|0);
     HEAP32[$970>>2] = $969;
     HEAP32[$941>>2] = $966;
     $971 = $966 >>> 3;
     $972 = ($966>>>0)<(256);
     if ($972) {
      $973 = $971 << 1;
      $974 = (17928 + ($973<<2)|0);
      $975 = HEAP32[4472]|0;
      $976 = 1 << $971;
      $977 = $975 & $976;
      $978 = ($977|0)==(0);
      if ($978) {
       $979 = $975 | $976;
       HEAP32[4472] = $979;
       $$pre$i$i = ((($974)) + 8|0);
       $$pre$phi$i$iZ2D = $$pre$i$i;$F$0$i$i = $974;
      } else {
       $980 = ((($974)) + 8|0);
       $981 = HEAP32[$980>>2]|0;
       $982 = HEAP32[(17904)>>2]|0;
       $983 = ($981>>>0)<($982>>>0);
       if ($983) {
        _abort();
        // unreachable;
       } else {
        $$pre$phi$i$iZ2D = $980;$F$0$i$i = $981;
       }
      }
      HEAP32[$$pre$phi$i$iZ2D>>2] = $635;
      $984 = ((($F$0$i$i)) + 12|0);
      HEAP32[$984>>2] = $635;
      $985 = ((($635)) + 8|0);
      HEAP32[$985>>2] = $F$0$i$i;
      $986 = ((($635)) + 12|0);
      HEAP32[$986>>2] = $974;
      break;
     }
     $987 = $966 >>> 8;
     $988 = ($987|0)==(0);
     if ($988) {
      $I1$0$i$i = 0;
     } else {
      $989 = ($966>>>0)>(16777215);
      if ($989) {
       $I1$0$i$i = 31;
      } else {
       $990 = (($987) + 1048320)|0;
       $991 = $990 >>> 16;
       $992 = $991 & 8;
       $993 = $987 << $992;
       $994 = (($993) + 520192)|0;
       $995 = $994 >>> 16;
       $996 = $995 & 4;
       $997 = $996 | $992;
       $998 = $993 << $996;
       $999 = (($998) + 245760)|0;
       $1000 = $999 >>> 16;
       $1001 = $1000 & 2;
       $1002 = $997 | $1001;
       $1003 = (14 - ($1002))|0;
       $1004 = $998 << $1001;
       $1005 = $1004 >>> 15;
       $1006 = (($1003) + ($1005))|0;
       $1007 = $1006 << 1;
       $1008 = (($1006) + 7)|0;
       $1009 = $966 >>> $1008;
       $1010 = $1009 & 1;
       $1011 = $1010 | $1007;
       $I1$0$i$i = $1011;
      }
     }
     $1012 = (18192 + ($I1$0$i$i<<2)|0);
     $1013 = ((($635)) + 28|0);
     HEAP32[$1013>>2] = $I1$0$i$i;
     $1014 = ((($635)) + 20|0);
     HEAP32[$1014>>2] = 0;
     HEAP32[$939>>2] = 0;
     $1015 = HEAP32[(17892)>>2]|0;
     $1016 = 1 << $I1$0$i$i;
     $1017 = $1015 & $1016;
     $1018 = ($1017|0)==(0);
     if ($1018) {
      $1019 = $1015 | $1016;
      HEAP32[(17892)>>2] = $1019;
      HEAP32[$1012>>2] = $635;
      $1020 = ((($635)) + 24|0);
      HEAP32[$1020>>2] = $1012;
      $1021 = ((($635)) + 12|0);
      HEAP32[$1021>>2] = $635;
      $1022 = ((($635)) + 8|0);
      HEAP32[$1022>>2] = $635;
      break;
     }
     $1023 = HEAP32[$1012>>2]|0;
     $1024 = ($I1$0$i$i|0)==(31);
     $1025 = $I1$0$i$i >>> 1;
     $1026 = (25 - ($1025))|0;
     $1027 = $1024 ? 0 : $1026;
     $1028 = $966 << $1027;
     $K2$0$i$i = $1028;$T$0$i$i = $1023;
     while(1) {
      $1029 = ((($T$0$i$i)) + 4|0);
      $1030 = HEAP32[$1029>>2]|0;
      $1031 = $1030 & -8;
      $1032 = ($1031|0)==($966|0);
      if ($1032) {
       $T$0$i$i$lcssa = $T$0$i$i;
       label = 307;
       break;
      }
      $1033 = $K2$0$i$i >>> 31;
      $1034 = (((($T$0$i$i)) + 16|0) + ($1033<<2)|0);
      $1035 = $K2$0$i$i << 1;
      $1036 = HEAP32[$1034>>2]|0;
      $1037 = ($1036|0)==(0|0);
      if ($1037) {
       $$lcssa141 = $1034;$T$0$i$i$lcssa140 = $T$0$i$i;
       label = 304;
       break;
      } else {
       $K2$0$i$i = $1035;$T$0$i$i = $1036;
      }
     }
     if ((label|0) == 304) {
      $1038 = HEAP32[(17904)>>2]|0;
      $1039 = ($$lcssa141>>>0)<($1038>>>0);
      if ($1039) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$$lcssa141>>2] = $635;
       $1040 = ((($635)) + 24|0);
       HEAP32[$1040>>2] = $T$0$i$i$lcssa140;
       $1041 = ((($635)) + 12|0);
       HEAP32[$1041>>2] = $635;
       $1042 = ((($635)) + 8|0);
       HEAP32[$1042>>2] = $635;
       break;
      }
     }
     else if ((label|0) == 307) {
      $1043 = ((($T$0$i$i$lcssa)) + 8|0);
      $1044 = HEAP32[$1043>>2]|0;
      $1045 = HEAP32[(17904)>>2]|0;
      $1046 = ($1044>>>0)>=($1045>>>0);
      $not$$i$i = ($T$0$i$i$lcssa>>>0)>=($1045>>>0);
      $1047 = $1046 & $not$$i$i;
      if ($1047) {
       $1048 = ((($1044)) + 12|0);
       HEAP32[$1048>>2] = $635;
       HEAP32[$1043>>2] = $635;
       $1049 = ((($635)) + 8|0);
       HEAP32[$1049>>2] = $1044;
       $1050 = ((($635)) + 12|0);
       HEAP32[$1050>>2] = $T$0$i$i$lcssa;
       $1051 = ((($635)) + 24|0);
       HEAP32[$1051>>2] = 0;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    }
   }
  } while(0);
  $1053 = HEAP32[(17900)>>2]|0;
  $1054 = ($1053>>>0)>($nb$0>>>0);
  if ($1054) {
   $1055 = (($1053) - ($nb$0))|0;
   HEAP32[(17900)>>2] = $1055;
   $1056 = HEAP32[(17912)>>2]|0;
   $1057 = (($1056) + ($nb$0)|0);
   HEAP32[(17912)>>2] = $1057;
   $1058 = $1055 | 1;
   $1059 = ((($1057)) + 4|0);
   HEAP32[$1059>>2] = $1058;
   $1060 = $nb$0 | 3;
   $1061 = ((($1056)) + 4|0);
   HEAP32[$1061>>2] = $1060;
   $1062 = ((($1056)) + 8|0);
   $$0 = $1062;
   return ($$0|0);
  }
 }
 $1063 = (___errno_location()|0);
 HEAP32[$1063>>2] = 12;
 $$0 = 0;
 return ($$0|0);
}
function _free($mem) {
 $mem = $mem|0;
 var $$lcssa = 0, $$pre = 0, $$pre$phi41Z2D = 0, $$pre$phi43Z2D = 0, $$pre$phiZ2D = 0, $$pre40 = 0, $$pre42 = 0, $0 = 0, $1 = 0, $10 = 0, $100 = 0, $101 = 0, $102 = 0, $103 = 0, $104 = 0, $105 = 0, $106 = 0, $107 = 0, $108 = 0, $109 = 0;
 var $11 = 0, $110 = 0, $111 = 0, $112 = 0, $113 = 0, $114 = 0, $115 = 0, $116 = 0, $117 = 0, $118 = 0, $119 = 0, $12 = 0, $120 = 0, $121 = 0, $122 = 0, $123 = 0, $124 = 0, $125 = 0, $126 = 0, $127 = 0;
 var $128 = 0, $129 = 0, $13 = 0, $130 = 0, $131 = 0, $132 = 0, $133 = 0, $134 = 0, $135 = 0, $136 = 0, $137 = 0, $138 = 0, $139 = 0, $14 = 0, $140 = 0, $141 = 0, $142 = 0, $143 = 0, $144 = 0, $145 = 0;
 var $146 = 0, $147 = 0, $148 = 0, $149 = 0, $15 = 0, $150 = 0, $151 = 0, $152 = 0, $153 = 0, $154 = 0, $155 = 0, $156 = 0, $157 = 0, $158 = 0, $159 = 0, $16 = 0, $160 = 0, $161 = 0, $162 = 0, $163 = 0;
 var $164 = 0, $165 = 0, $166 = 0, $167 = 0, $168 = 0, $169 = 0, $17 = 0, $170 = 0, $171 = 0, $172 = 0, $173 = 0, $174 = 0, $175 = 0, $176 = 0, $177 = 0, $178 = 0, $179 = 0, $18 = 0, $180 = 0, $181 = 0;
 var $182 = 0, $183 = 0, $184 = 0, $185 = 0, $186 = 0, $187 = 0, $188 = 0, $189 = 0, $19 = 0, $190 = 0, $191 = 0, $192 = 0, $193 = 0, $194 = 0, $195 = 0, $196 = 0, $197 = 0, $198 = 0, $199 = 0, $2 = 0;
 var $20 = 0, $200 = 0, $201 = 0, $202 = 0, $203 = 0, $204 = 0, $205 = 0, $206 = 0, $207 = 0, $208 = 0, $209 = 0, $21 = 0, $210 = 0, $211 = 0, $212 = 0, $213 = 0, $214 = 0, $215 = 0, $216 = 0, $217 = 0;
 var $218 = 0, $219 = 0, $22 = 0, $220 = 0, $221 = 0, $222 = 0, $223 = 0, $224 = 0, $225 = 0, $226 = 0, $227 = 0, $228 = 0, $229 = 0, $23 = 0, $230 = 0, $231 = 0, $232 = 0, $233 = 0, $234 = 0, $235 = 0;
 var $236 = 0, $237 = 0, $238 = 0, $239 = 0, $24 = 0, $240 = 0, $241 = 0, $242 = 0, $243 = 0, $244 = 0, $245 = 0, $246 = 0, $247 = 0, $248 = 0, $249 = 0, $25 = 0, $250 = 0, $251 = 0, $252 = 0, $253 = 0;
 var $254 = 0, $255 = 0, $256 = 0, $257 = 0, $258 = 0, $259 = 0, $26 = 0, $260 = 0, $261 = 0, $262 = 0, $263 = 0, $264 = 0, $265 = 0, $266 = 0, $267 = 0, $268 = 0, $269 = 0, $27 = 0, $270 = 0, $271 = 0;
 var $272 = 0, $273 = 0, $274 = 0, $275 = 0, $276 = 0, $277 = 0, $278 = 0, $279 = 0, $28 = 0, $280 = 0, $281 = 0, $282 = 0, $283 = 0, $284 = 0, $285 = 0, $286 = 0, $287 = 0, $288 = 0, $289 = 0, $29 = 0;
 var $290 = 0, $291 = 0, $292 = 0, $293 = 0, $294 = 0, $295 = 0, $296 = 0, $297 = 0, $298 = 0, $299 = 0, $3 = 0, $30 = 0, $300 = 0, $301 = 0, $302 = 0, $303 = 0, $304 = 0, $305 = 0, $306 = 0, $307 = 0;
 var $308 = 0, $309 = 0, $31 = 0, $310 = 0, $311 = 0, $312 = 0, $313 = 0, $314 = 0, $315 = 0, $316 = 0, $317 = 0, $318 = 0, $319 = 0, $32 = 0, $33 = 0, $34 = 0, $35 = 0, $36 = 0, $37 = 0, $38 = 0;
 var $39 = 0, $4 = 0, $40 = 0, $41 = 0, $42 = 0, $43 = 0, $44 = 0, $45 = 0, $46 = 0, $47 = 0, $48 = 0, $49 = 0, $5 = 0, $50 = 0, $51 = 0, $52 = 0, $53 = 0, $54 = 0, $55 = 0, $56 = 0;
 var $57 = 0, $58 = 0, $59 = 0, $6 = 0, $60 = 0, $61 = 0, $62 = 0, $63 = 0, $64 = 0, $65 = 0, $66 = 0, $67 = 0, $68 = 0, $69 = 0, $7 = 0, $70 = 0, $71 = 0, $72 = 0, $73 = 0, $74 = 0;
 var $75 = 0, $76 = 0, $77 = 0, $78 = 0, $79 = 0, $8 = 0, $80 = 0, $81 = 0, $82 = 0, $83 = 0, $84 = 0, $85 = 0, $86 = 0, $87 = 0, $88 = 0, $89 = 0, $9 = 0, $90 = 0, $91 = 0, $92 = 0;
 var $93 = 0, $94 = 0, $95 = 0, $96 = 0, $97 = 0, $98 = 0, $99 = 0, $F18$0 = 0, $I20$0 = 0, $K21$0 = 0, $R$1 = 0, $R$1$lcssa = 0, $R$3 = 0, $R8$1 = 0, $R8$1$lcssa = 0, $R8$3 = 0, $RP$1 = 0, $RP$1$lcssa = 0, $RP10$1 = 0, $RP10$1$lcssa = 0;
 var $T$0 = 0, $T$0$lcssa = 0, $T$0$lcssa48 = 0, $cond20 = 0, $cond21 = 0, $not$ = 0, $p$1 = 0, $psize$1 = 0, $psize$2 = 0, $sp$0$i = 0, $sp$0$in$i = 0, label = 0, sp = 0;
 sp = STACKTOP;
 $0 = ($mem|0)==(0|0);
 if ($0) {
  return;
 }
 $1 = ((($mem)) + -8|0);
 $2 = HEAP32[(17904)>>2]|0;
 $3 = ($1>>>0)<($2>>>0);
 if ($3) {
  _abort();
  // unreachable;
 }
 $4 = ((($mem)) + -4|0);
 $5 = HEAP32[$4>>2]|0;
 $6 = $5 & 3;
 $7 = ($6|0)==(1);
 if ($7) {
  _abort();
  // unreachable;
 }
 $8 = $5 & -8;
 $9 = (($1) + ($8)|0);
 $10 = $5 & 1;
 $11 = ($10|0)==(0);
 do {
  if ($11) {
   $12 = HEAP32[$1>>2]|0;
   $13 = ($6|0)==(0);
   if ($13) {
    return;
   }
   $14 = (0 - ($12))|0;
   $15 = (($1) + ($14)|0);
   $16 = (($12) + ($8))|0;
   $17 = ($15>>>0)<($2>>>0);
   if ($17) {
    _abort();
    // unreachable;
   }
   $18 = HEAP32[(17908)>>2]|0;
   $19 = ($15|0)==($18|0);
   if ($19) {
    $104 = ((($9)) + 4|0);
    $105 = HEAP32[$104>>2]|0;
    $106 = $105 & 3;
    $107 = ($106|0)==(3);
    if (!($107)) {
     $p$1 = $15;$psize$1 = $16;
     break;
    }
    HEAP32[(17896)>>2] = $16;
    $108 = $105 & -2;
    HEAP32[$104>>2] = $108;
    $109 = $16 | 1;
    $110 = ((($15)) + 4|0);
    HEAP32[$110>>2] = $109;
    $111 = (($15) + ($16)|0);
    HEAP32[$111>>2] = $16;
    return;
   }
   $20 = $12 >>> 3;
   $21 = ($12>>>0)<(256);
   if ($21) {
    $22 = ((($15)) + 8|0);
    $23 = HEAP32[$22>>2]|0;
    $24 = ((($15)) + 12|0);
    $25 = HEAP32[$24>>2]|0;
    $26 = $20 << 1;
    $27 = (17928 + ($26<<2)|0);
    $28 = ($23|0)==($27|0);
    if (!($28)) {
     $29 = ($23>>>0)<($2>>>0);
     if ($29) {
      _abort();
      // unreachable;
     }
     $30 = ((($23)) + 12|0);
     $31 = HEAP32[$30>>2]|0;
     $32 = ($31|0)==($15|0);
     if (!($32)) {
      _abort();
      // unreachable;
     }
    }
    $33 = ($25|0)==($23|0);
    if ($33) {
     $34 = 1 << $20;
     $35 = $34 ^ -1;
     $36 = HEAP32[4472]|0;
     $37 = $36 & $35;
     HEAP32[4472] = $37;
     $p$1 = $15;$psize$1 = $16;
     break;
    }
    $38 = ($25|0)==($27|0);
    if ($38) {
     $$pre42 = ((($25)) + 8|0);
     $$pre$phi43Z2D = $$pre42;
    } else {
     $39 = ($25>>>0)<($2>>>0);
     if ($39) {
      _abort();
      // unreachable;
     }
     $40 = ((($25)) + 8|0);
     $41 = HEAP32[$40>>2]|0;
     $42 = ($41|0)==($15|0);
     if ($42) {
      $$pre$phi43Z2D = $40;
     } else {
      _abort();
      // unreachable;
     }
    }
    $43 = ((($23)) + 12|0);
    HEAP32[$43>>2] = $25;
    HEAP32[$$pre$phi43Z2D>>2] = $23;
    $p$1 = $15;$psize$1 = $16;
    break;
   }
   $44 = ((($15)) + 24|0);
   $45 = HEAP32[$44>>2]|0;
   $46 = ((($15)) + 12|0);
   $47 = HEAP32[$46>>2]|0;
   $48 = ($47|0)==($15|0);
   do {
    if ($48) {
     $58 = ((($15)) + 16|0);
     $59 = ((($58)) + 4|0);
     $60 = HEAP32[$59>>2]|0;
     $61 = ($60|0)==(0|0);
     if ($61) {
      $62 = HEAP32[$58>>2]|0;
      $63 = ($62|0)==(0|0);
      if ($63) {
       $R$3 = 0;
       break;
      } else {
       $R$1 = $62;$RP$1 = $58;
      }
     } else {
      $R$1 = $60;$RP$1 = $59;
     }
     while(1) {
      $64 = ((($R$1)) + 20|0);
      $65 = HEAP32[$64>>2]|0;
      $66 = ($65|0)==(0|0);
      if (!($66)) {
       $R$1 = $65;$RP$1 = $64;
       continue;
      }
      $67 = ((($R$1)) + 16|0);
      $68 = HEAP32[$67>>2]|0;
      $69 = ($68|0)==(0|0);
      if ($69) {
       $R$1$lcssa = $R$1;$RP$1$lcssa = $RP$1;
       break;
      } else {
       $R$1 = $68;$RP$1 = $67;
      }
     }
     $70 = ($RP$1$lcssa>>>0)<($2>>>0);
     if ($70) {
      _abort();
      // unreachable;
     } else {
      HEAP32[$RP$1$lcssa>>2] = 0;
      $R$3 = $R$1$lcssa;
      break;
     }
    } else {
     $49 = ((($15)) + 8|0);
     $50 = HEAP32[$49>>2]|0;
     $51 = ($50>>>0)<($2>>>0);
     if ($51) {
      _abort();
      // unreachable;
     }
     $52 = ((($50)) + 12|0);
     $53 = HEAP32[$52>>2]|0;
     $54 = ($53|0)==($15|0);
     if (!($54)) {
      _abort();
      // unreachable;
     }
     $55 = ((($47)) + 8|0);
     $56 = HEAP32[$55>>2]|0;
     $57 = ($56|0)==($15|0);
     if ($57) {
      HEAP32[$52>>2] = $47;
      HEAP32[$55>>2] = $50;
      $R$3 = $47;
      break;
     } else {
      _abort();
      // unreachable;
     }
    }
   } while(0);
   $71 = ($45|0)==(0|0);
   if ($71) {
    $p$1 = $15;$psize$1 = $16;
   } else {
    $72 = ((($15)) + 28|0);
    $73 = HEAP32[$72>>2]|0;
    $74 = (18192 + ($73<<2)|0);
    $75 = HEAP32[$74>>2]|0;
    $76 = ($15|0)==($75|0);
    if ($76) {
     HEAP32[$74>>2] = $R$3;
     $cond20 = ($R$3|0)==(0|0);
     if ($cond20) {
      $77 = 1 << $73;
      $78 = $77 ^ -1;
      $79 = HEAP32[(17892)>>2]|0;
      $80 = $79 & $78;
      HEAP32[(17892)>>2] = $80;
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    } else {
     $81 = HEAP32[(17904)>>2]|0;
     $82 = ($45>>>0)<($81>>>0);
     if ($82) {
      _abort();
      // unreachable;
     }
     $83 = ((($45)) + 16|0);
     $84 = HEAP32[$83>>2]|0;
     $85 = ($84|0)==($15|0);
     if ($85) {
      HEAP32[$83>>2] = $R$3;
     } else {
      $86 = ((($45)) + 20|0);
      HEAP32[$86>>2] = $R$3;
     }
     $87 = ($R$3|0)==(0|0);
     if ($87) {
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    }
    $88 = HEAP32[(17904)>>2]|0;
    $89 = ($R$3>>>0)<($88>>>0);
    if ($89) {
     _abort();
     // unreachable;
    }
    $90 = ((($R$3)) + 24|0);
    HEAP32[$90>>2] = $45;
    $91 = ((($15)) + 16|0);
    $92 = HEAP32[$91>>2]|0;
    $93 = ($92|0)==(0|0);
    do {
     if (!($93)) {
      $94 = ($92>>>0)<($88>>>0);
      if ($94) {
       _abort();
       // unreachable;
      } else {
       $95 = ((($R$3)) + 16|0);
       HEAP32[$95>>2] = $92;
       $96 = ((($92)) + 24|0);
       HEAP32[$96>>2] = $R$3;
       break;
      }
     }
    } while(0);
    $97 = ((($91)) + 4|0);
    $98 = HEAP32[$97>>2]|0;
    $99 = ($98|0)==(0|0);
    if ($99) {
     $p$1 = $15;$psize$1 = $16;
    } else {
     $100 = HEAP32[(17904)>>2]|0;
     $101 = ($98>>>0)<($100>>>0);
     if ($101) {
      _abort();
      // unreachable;
     } else {
      $102 = ((($R$3)) + 20|0);
      HEAP32[$102>>2] = $98;
      $103 = ((($98)) + 24|0);
      HEAP32[$103>>2] = $R$3;
      $p$1 = $15;$psize$1 = $16;
      break;
     }
    }
   }
  } else {
   $p$1 = $1;$psize$1 = $8;
  }
 } while(0);
 $112 = ($p$1>>>0)<($9>>>0);
 if (!($112)) {
  _abort();
  // unreachable;
 }
 $113 = ((($9)) + 4|0);
 $114 = HEAP32[$113>>2]|0;
 $115 = $114 & 1;
 $116 = ($115|0)==(0);
 if ($116) {
  _abort();
  // unreachable;
 }
 $117 = $114 & 2;
 $118 = ($117|0)==(0);
 if ($118) {
  $119 = HEAP32[(17912)>>2]|0;
  $120 = ($9|0)==($119|0);
  if ($120) {
   $121 = HEAP32[(17900)>>2]|0;
   $122 = (($121) + ($psize$1))|0;
   HEAP32[(17900)>>2] = $122;
   HEAP32[(17912)>>2] = $p$1;
   $123 = $122 | 1;
   $124 = ((($p$1)) + 4|0);
   HEAP32[$124>>2] = $123;
   $125 = HEAP32[(17908)>>2]|0;
   $126 = ($p$1|0)==($125|0);
   if (!($126)) {
    return;
   }
   HEAP32[(17908)>>2] = 0;
   HEAP32[(17896)>>2] = 0;
   return;
  }
  $127 = HEAP32[(17908)>>2]|0;
  $128 = ($9|0)==($127|0);
  if ($128) {
   $129 = HEAP32[(17896)>>2]|0;
   $130 = (($129) + ($psize$1))|0;
   HEAP32[(17896)>>2] = $130;
   HEAP32[(17908)>>2] = $p$1;
   $131 = $130 | 1;
   $132 = ((($p$1)) + 4|0);
   HEAP32[$132>>2] = $131;
   $133 = (($p$1) + ($130)|0);
   HEAP32[$133>>2] = $130;
   return;
  }
  $134 = $114 & -8;
  $135 = (($134) + ($psize$1))|0;
  $136 = $114 >>> 3;
  $137 = ($114>>>0)<(256);
  do {
   if ($137) {
    $138 = ((($9)) + 8|0);
    $139 = HEAP32[$138>>2]|0;
    $140 = ((($9)) + 12|0);
    $141 = HEAP32[$140>>2]|0;
    $142 = $136 << 1;
    $143 = (17928 + ($142<<2)|0);
    $144 = ($139|0)==($143|0);
    if (!($144)) {
     $145 = HEAP32[(17904)>>2]|0;
     $146 = ($139>>>0)<($145>>>0);
     if ($146) {
      _abort();
      // unreachable;
     }
     $147 = ((($139)) + 12|0);
     $148 = HEAP32[$147>>2]|0;
     $149 = ($148|0)==($9|0);
     if (!($149)) {
      _abort();
      // unreachable;
     }
    }
    $150 = ($141|0)==($139|0);
    if ($150) {
     $151 = 1 << $136;
     $152 = $151 ^ -1;
     $153 = HEAP32[4472]|0;
     $154 = $153 & $152;
     HEAP32[4472] = $154;
     break;
    }
    $155 = ($141|0)==($143|0);
    if ($155) {
     $$pre40 = ((($141)) + 8|0);
     $$pre$phi41Z2D = $$pre40;
    } else {
     $156 = HEAP32[(17904)>>2]|0;
     $157 = ($141>>>0)<($156>>>0);
     if ($157) {
      _abort();
      // unreachable;
     }
     $158 = ((($141)) + 8|0);
     $159 = HEAP32[$158>>2]|0;
     $160 = ($159|0)==($9|0);
     if ($160) {
      $$pre$phi41Z2D = $158;
     } else {
      _abort();
      // unreachable;
     }
    }
    $161 = ((($139)) + 12|0);
    HEAP32[$161>>2] = $141;
    HEAP32[$$pre$phi41Z2D>>2] = $139;
   } else {
    $162 = ((($9)) + 24|0);
    $163 = HEAP32[$162>>2]|0;
    $164 = ((($9)) + 12|0);
    $165 = HEAP32[$164>>2]|0;
    $166 = ($165|0)==($9|0);
    do {
     if ($166) {
      $177 = ((($9)) + 16|0);
      $178 = ((($177)) + 4|0);
      $179 = HEAP32[$178>>2]|0;
      $180 = ($179|0)==(0|0);
      if ($180) {
       $181 = HEAP32[$177>>2]|0;
       $182 = ($181|0)==(0|0);
       if ($182) {
        $R8$3 = 0;
        break;
       } else {
        $R8$1 = $181;$RP10$1 = $177;
       }
      } else {
       $R8$1 = $179;$RP10$1 = $178;
      }
      while(1) {
       $183 = ((($R8$1)) + 20|0);
       $184 = HEAP32[$183>>2]|0;
       $185 = ($184|0)==(0|0);
       if (!($185)) {
        $R8$1 = $184;$RP10$1 = $183;
        continue;
       }
       $186 = ((($R8$1)) + 16|0);
       $187 = HEAP32[$186>>2]|0;
       $188 = ($187|0)==(0|0);
       if ($188) {
        $R8$1$lcssa = $R8$1;$RP10$1$lcssa = $RP10$1;
        break;
       } else {
        $R8$1 = $187;$RP10$1 = $186;
       }
      }
      $189 = HEAP32[(17904)>>2]|0;
      $190 = ($RP10$1$lcssa>>>0)<($189>>>0);
      if ($190) {
       _abort();
       // unreachable;
      } else {
       HEAP32[$RP10$1$lcssa>>2] = 0;
       $R8$3 = $R8$1$lcssa;
       break;
      }
     } else {
      $167 = ((($9)) + 8|0);
      $168 = HEAP32[$167>>2]|0;
      $169 = HEAP32[(17904)>>2]|0;
      $170 = ($168>>>0)<($169>>>0);
      if ($170) {
       _abort();
       // unreachable;
      }
      $171 = ((($168)) + 12|0);
      $172 = HEAP32[$171>>2]|0;
      $173 = ($172|0)==($9|0);
      if (!($173)) {
       _abort();
       // unreachable;
      }
      $174 = ((($165)) + 8|0);
      $175 = HEAP32[$174>>2]|0;
      $176 = ($175|0)==($9|0);
      if ($176) {
       HEAP32[$171>>2] = $165;
       HEAP32[$174>>2] = $168;
       $R8$3 = $165;
       break;
      } else {
       _abort();
       // unreachable;
      }
     }
    } while(0);
    $191 = ($163|0)==(0|0);
    if (!($191)) {
     $192 = ((($9)) + 28|0);
     $193 = HEAP32[$192>>2]|0;
     $194 = (18192 + ($193<<2)|0);
     $195 = HEAP32[$194>>2]|0;
     $196 = ($9|0)==($195|0);
     if ($196) {
      HEAP32[$194>>2] = $R8$3;
      $cond21 = ($R8$3|0)==(0|0);
      if ($cond21) {
       $197 = 1 << $193;
       $198 = $197 ^ -1;
       $199 = HEAP32[(17892)>>2]|0;
       $200 = $199 & $198;
       HEAP32[(17892)>>2] = $200;
       break;
      }
     } else {
      $201 = HEAP32[(17904)>>2]|0;
      $202 = ($163>>>0)<($201>>>0);
      if ($202) {
       _abort();
       // unreachable;
      }
      $203 = ((($163)) + 16|0);
      $204 = HEAP32[$203>>2]|0;
      $205 = ($204|0)==($9|0);
      if ($205) {
       HEAP32[$203>>2] = $R8$3;
      } else {
       $206 = ((($163)) + 20|0);
       HEAP32[$206>>2] = $R8$3;
      }
      $207 = ($R8$3|0)==(0|0);
      if ($207) {
       break;
      }
     }
     $208 = HEAP32[(17904)>>2]|0;
     $209 = ($R8$3>>>0)<($208>>>0);
     if ($209) {
      _abort();
      // unreachable;
     }
     $210 = ((($R8$3)) + 24|0);
     HEAP32[$210>>2] = $163;
     $211 = ((($9)) + 16|0);
     $212 = HEAP32[$211>>2]|0;
     $213 = ($212|0)==(0|0);
     do {
      if (!($213)) {
       $214 = ($212>>>0)<($208>>>0);
       if ($214) {
        _abort();
        // unreachable;
       } else {
        $215 = ((($R8$3)) + 16|0);
        HEAP32[$215>>2] = $212;
        $216 = ((($212)) + 24|0);
        HEAP32[$216>>2] = $R8$3;
        break;
       }
      }
     } while(0);
     $217 = ((($211)) + 4|0);
     $218 = HEAP32[$217>>2]|0;
     $219 = ($218|0)==(0|0);
     if (!($219)) {
      $220 = HEAP32[(17904)>>2]|0;
      $221 = ($218>>>0)<($220>>>0);
      if ($221) {
       _abort();
       // unreachable;
      } else {
       $222 = ((($R8$3)) + 20|0);
       HEAP32[$222>>2] = $218;
       $223 = ((($218)) + 24|0);
       HEAP32[$223>>2] = $R8$3;
       break;
      }
     }
    }
   }
  } while(0);
  $224 = $135 | 1;
  $225 = ((($p$1)) + 4|0);
  HEAP32[$225>>2] = $224;
  $226 = (($p$1) + ($135)|0);
  HEAP32[$226>>2] = $135;
  $227 = HEAP32[(17908)>>2]|0;
  $228 = ($p$1|0)==($227|0);
  if ($228) {
   HEAP32[(17896)>>2] = $135;
   return;
  } else {
   $psize$2 = $135;
  }
 } else {
  $229 = $114 & -2;
  HEAP32[$113>>2] = $229;
  $230 = $psize$1 | 1;
  $231 = ((($p$1)) + 4|0);
  HEAP32[$231>>2] = $230;
  $232 = (($p$1) + ($psize$1)|0);
  HEAP32[$232>>2] = $psize$1;
  $psize$2 = $psize$1;
 }
 $233 = $psize$2 >>> 3;
 $234 = ($psize$2>>>0)<(256);
 if ($234) {
  $235 = $233 << 1;
  $236 = (17928 + ($235<<2)|0);
  $237 = HEAP32[4472]|0;
  $238 = 1 << $233;
  $239 = $237 & $238;
  $240 = ($239|0)==(0);
  if ($240) {
   $241 = $237 | $238;
   HEAP32[4472] = $241;
   $$pre = ((($236)) + 8|0);
   $$pre$phiZ2D = $$pre;$F18$0 = $236;
  } else {
   $242 = ((($236)) + 8|0);
   $243 = HEAP32[$242>>2]|0;
   $244 = HEAP32[(17904)>>2]|0;
   $245 = ($243>>>0)<($244>>>0);
   if ($245) {
    _abort();
    // unreachable;
   } else {
    $$pre$phiZ2D = $242;$F18$0 = $243;
   }
  }
  HEAP32[$$pre$phiZ2D>>2] = $p$1;
  $246 = ((($F18$0)) + 12|0);
  HEAP32[$246>>2] = $p$1;
  $247 = ((($p$1)) + 8|0);
  HEAP32[$247>>2] = $F18$0;
  $248 = ((($p$1)) + 12|0);
  HEAP32[$248>>2] = $236;
  return;
 }
 $249 = $psize$2 >>> 8;
 $250 = ($249|0)==(0);
 if ($250) {
  $I20$0 = 0;
 } else {
  $251 = ($psize$2>>>0)>(16777215);
  if ($251) {
   $I20$0 = 31;
  } else {
   $252 = (($249) + 1048320)|0;
   $253 = $252 >>> 16;
   $254 = $253 & 8;
   $255 = $249 << $254;
   $256 = (($255) + 520192)|0;
   $257 = $256 >>> 16;
   $258 = $257 & 4;
   $259 = $258 | $254;
   $260 = $255 << $258;
   $261 = (($260) + 245760)|0;
   $262 = $261 >>> 16;
   $263 = $262 & 2;
   $264 = $259 | $263;
   $265 = (14 - ($264))|0;
   $266 = $260 << $263;
   $267 = $266 >>> 15;
   $268 = (($265) + ($267))|0;
   $269 = $268 << 1;
   $270 = (($268) + 7)|0;
   $271 = $psize$2 >>> $270;
   $272 = $271 & 1;
   $273 = $272 | $269;
   $I20$0 = $273;
  }
 }
 $274 = (18192 + ($I20$0<<2)|0);
 $275 = ((($p$1)) + 28|0);
 HEAP32[$275>>2] = $I20$0;
 $276 = ((($p$1)) + 16|0);
 $277 = ((($p$1)) + 20|0);
 HEAP32[$277>>2] = 0;
 HEAP32[$276>>2] = 0;
 $278 = HEAP32[(17892)>>2]|0;
 $279 = 1 << $I20$0;
 $280 = $278 & $279;
 $281 = ($280|0)==(0);
 do {
  if ($281) {
   $282 = $278 | $279;
   HEAP32[(17892)>>2] = $282;
   HEAP32[$274>>2] = $p$1;
   $283 = ((($p$1)) + 24|0);
   HEAP32[$283>>2] = $274;
   $284 = ((($p$1)) + 12|0);
   HEAP32[$284>>2] = $p$1;
   $285 = ((($p$1)) + 8|0);
   HEAP32[$285>>2] = $p$1;
  } else {
   $286 = HEAP32[$274>>2]|0;
   $287 = ($I20$0|0)==(31);
   $288 = $I20$0 >>> 1;
   $289 = (25 - ($288))|0;
   $290 = $287 ? 0 : $289;
   $291 = $psize$2 << $290;
   $K21$0 = $291;$T$0 = $286;
   while(1) {
    $292 = ((($T$0)) + 4|0);
    $293 = HEAP32[$292>>2]|0;
    $294 = $293 & -8;
    $295 = ($294|0)==($psize$2|0);
    if ($295) {
     $T$0$lcssa = $T$0;
     label = 130;
     break;
    }
    $296 = $K21$0 >>> 31;
    $297 = (((($T$0)) + 16|0) + ($296<<2)|0);
    $298 = $K21$0 << 1;
    $299 = HEAP32[$297>>2]|0;
    $300 = ($299|0)==(0|0);
    if ($300) {
     $$lcssa = $297;$T$0$lcssa48 = $T$0;
     label = 127;
     break;
    } else {
     $K21$0 = $298;$T$0 = $299;
    }
   }
   if ((label|0) == 127) {
    $301 = HEAP32[(17904)>>2]|0;
    $302 = ($$lcssa>>>0)<($301>>>0);
    if ($302) {
     _abort();
     // unreachable;
    } else {
     HEAP32[$$lcssa>>2] = $p$1;
     $303 = ((($p$1)) + 24|0);
     HEAP32[$303>>2] = $T$0$lcssa48;
     $304 = ((($p$1)) + 12|0);
     HEAP32[$304>>2] = $p$1;
     $305 = ((($p$1)) + 8|0);
     HEAP32[$305>>2] = $p$1;
     break;
    }
   }
   else if ((label|0) == 130) {
    $306 = ((($T$0$lcssa)) + 8|0);
    $307 = HEAP32[$306>>2]|0;
    $308 = HEAP32[(17904)>>2]|0;
    $309 = ($307>>>0)>=($308>>>0);
    $not$ = ($T$0$lcssa>>>0)>=($308>>>0);
    $310 = $309 & $not$;
    if ($310) {
     $311 = ((($307)) + 12|0);
     HEAP32[$311>>2] = $p$1;
     HEAP32[$306>>2] = $p$1;
     $312 = ((($p$1)) + 8|0);
     HEAP32[$312>>2] = $307;
     $313 = ((($p$1)) + 12|0);
     HEAP32[$313>>2] = $T$0$lcssa;
     $314 = ((($p$1)) + 24|0);
     HEAP32[$314>>2] = 0;
     break;
    } else {
     _abort();
     // unreachable;
    }
   }
  }
 } while(0);
 $315 = HEAP32[(17920)>>2]|0;
 $316 = (($315) + -1)|0;
 HEAP32[(17920)>>2] = $316;
 $317 = ($316|0)==(0);
 if ($317) {
  $sp$0$in$i = (18344);
 } else {
  return;
 }
 while(1) {
  $sp$0$i = HEAP32[$sp$0$in$i>>2]|0;
  $318 = ($sp$0$i|0)==(0|0);
  $319 = ((($sp$0$i)) + 8|0);
  if ($318) {
   break;
  } else {
   $sp$0$in$i = $319;
  }
 }
 HEAP32[(17920)>>2] = -1;
 return;
}
function runPostSets() {
}
function _memset(ptr, value, num) {
    ptr = ptr|0; value = value|0; num = num|0;
    var stop = 0, value4 = 0, stop4 = 0, unaligned = 0;
    stop = (ptr + num)|0;
    if ((num|0) >= 20) {
      // This is unaligned, but quite large, so work hard to get to aligned settings
      value = value & 0xff;
      unaligned = ptr & 3;
      value4 = value | (value << 8) | (value << 16) | (value << 24);
      stop4 = stop & ~3;
      if (unaligned) {
        unaligned = (ptr + 4 - unaligned)|0;
        while ((ptr|0) < (unaligned|0)) { // no need to check for stop, since we have large num
          HEAP8[((ptr)>>0)]=value;
          ptr = (ptr+1)|0;
        }
      }
      while ((ptr|0) < (stop4|0)) {
        HEAP32[((ptr)>>2)]=value4;
        ptr = (ptr+4)|0;
      }
    }
    while ((ptr|0) < (stop|0)) {
      HEAP8[((ptr)>>0)]=value;
      ptr = (ptr+1)|0;
    }
    return (ptr-num)|0;
}
function _memcpy(dest, src, num) {
    dest = dest|0; src = src|0; num = num|0;
    var ret = 0;
    if ((num|0) >= 4096) return _emscripten_memcpy_big(dest|0, src|0, num|0)|0;
    ret = dest|0;
    if ((dest&3) == (src&3)) {
      while (dest & 3) {
        if ((num|0) == 0) return ret|0;
        HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
        dest = (dest+1)|0;
        src = (src+1)|0;
        num = (num-1)|0;
      }
      while ((num|0) >= 4) {
        HEAP32[((dest)>>2)]=((HEAP32[((src)>>2)])|0);
        dest = (dest+4)|0;
        src = (src+4)|0;
        num = (num-4)|0;
      }
    }
    while ((num|0) > 0) {
      HEAP8[((dest)>>0)]=((HEAP8[((src)>>0)])|0);
      dest = (dest+1)|0;
      src = (src+1)|0;
      num = (num-1)|0;
    }
    return ret|0;
}

  
function dynCall_iiii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  return FUNCTION_TABLE_iiii[index&15](a1|0,a2|0,a3|0)|0;
}


function dynCall_vi(index,a1) {
  index = index|0;
  a1=a1|0;
  FUNCTION_TABLE_vi[index&15](a1|0);
}


function dynCall_vii(index,a1,a2) {
  index = index|0;
  a1=a1|0; a2=a2|0;
  FUNCTION_TABLE_vii[index&0](a1|0,a2|0);
}


function dynCall_ii(index,a1) {
  index = index|0;
  a1=a1|0;
  return FUNCTION_TABLE_ii[index&1](a1|0)|0;
}


function dynCall_viii(index,a1,a2,a3) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0;
  FUNCTION_TABLE_viii[index&0](a1|0,a2|0,a3|0);
}


function dynCall_viiiiiii(index,a1,a2,a3,a4,a5,a6,a7) {
  index = index|0;
  a1=a1|0; a2=a2|0; a3=a3|0; a4=a4|0; a5=a5|0; a6=a6|0; a7=a7|0;
  FUNCTION_TABLE_viiiiiii[index&0](a1|0,a2|0,a3|0,a4|0,a5|0,a6|0,a7|0);
}

function b0(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_iiii(0);return 0;
}
function b1(p0) {
 p0 = p0|0; nullFunc_vi(1);
}
function b2(p0,p1) {
 p0 = p0|0;p1 = p1|0; nullFunc_vii(2);
}
function b3(p0) {
 p0 = p0|0; nullFunc_ii(3);return 0;
}
function b4(p0,p1,p2) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0; nullFunc_viii(4);
}
function b5(p0,p1,p2,p3,p4,p5,p6) {
 p0 = p0|0;p1 = p1|0;p2 = p2|0;p3 = p3|0;p4 = p4|0;p5 = p5|0;p6 = p6|0; nullFunc_viiiiiii(5);
}

// EMSCRIPTEN_END_FUNCS
var FUNCTION_TABLE_iiii = [b0,b0,___stdout_write,___stdio_seek,b0,b0,b0,b0,b0,b0,___stdio_write,b0,b0,b0,b0,b0];
var FUNCTION_TABLE_vi = [b1,b1,b1,b1,__ZN7HashMapI10StringNameN12ObjectTypeDB8TypeInfoE16StringNameHasherLh3ELh8EED2Ev,__ZN7HashMapI10StringNameS0_16StringNameHasherLh3ELh8EED2Ev,__ZN7HashMapI6StringP8Resource20HashMapHahserDefaultLh3ELh8EED2Ev,__ZN7HashMapIjP6Object20HashMapHahserDefaultLh3ELh8EED2Ev,__ZN7HashMapIP6ObjectjN8ObjectDB13ObjectPtrHashELh3ELh8EED2Ev,_cleanup_575,b1,b1,b1,b1,b1,b1];
var FUNCTION_TABLE_vii = [b2];
var FUNCTION_TABLE_ii = [b3,___stdio_close];
var FUNCTION_TABLE_viii = [b4];
var FUNCTION_TABLE_viiiiiii = [b5];

  return { _free: _free, _memset: _memset, _malloc: _malloc, _memcpy: _memcpy, _fflush: _fflush, ___errno_location: ___errno_location, __GLOBAL__sub_I_object_type_db_cpp: __GLOBAL__sub_I_object_type_db_cpp, __GLOBAL__sub_I_resource_cpp: __GLOBAL__sub_I_resource_cpp, __GLOBAL__sub_I_object_cpp: __GLOBAL__sub_I_object_cpp, __GLOBAL__sub_I_matrix3_cpp: __GLOBAL__sub_I_matrix3_cpp, runPostSets: runPostSets, stackAlloc: stackAlloc, stackSave: stackSave, stackRestore: stackRestore, establishStackSpace: establishStackSpace, setThrew: setThrew, setTempRet0: setTempRet0, getTempRet0: getTempRet0, dynCall_iiii: dynCall_iiii, dynCall_vi: dynCall_vi, dynCall_vii: dynCall_vii, dynCall_ii: dynCall_ii, dynCall_viii: dynCall_viii, dynCall_viiiiiii: dynCall_viiiiiii };
})
// EMSCRIPTEN_END_ASM
(Module.asmGlobalArg, Module.asmLibraryArg, buffer);
var real___GLOBAL__sub_I_object_cpp = asm["__GLOBAL__sub_I_object_cpp"]; asm["__GLOBAL__sub_I_object_cpp"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___GLOBAL__sub_I_object_cpp.apply(null, arguments);
};

var real__fflush = asm["_fflush"]; asm["_fflush"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__fflush.apply(null, arguments);
};

var real___GLOBAL__sub_I_object_type_db_cpp = asm["__GLOBAL__sub_I_object_type_db_cpp"]; asm["__GLOBAL__sub_I_object_type_db_cpp"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___GLOBAL__sub_I_object_type_db_cpp.apply(null, arguments);
};

var real__malloc = asm["_malloc"]; asm["_malloc"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__malloc.apply(null, arguments);
};

var real___GLOBAL__sub_I_matrix3_cpp = asm["__GLOBAL__sub_I_matrix3_cpp"]; asm["__GLOBAL__sub_I_matrix3_cpp"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___GLOBAL__sub_I_matrix3_cpp.apply(null, arguments);
};

var real___GLOBAL__sub_I_resource_cpp = asm["__GLOBAL__sub_I_resource_cpp"]; asm["__GLOBAL__sub_I_resource_cpp"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real___GLOBAL__sub_I_resource_cpp.apply(null, arguments);
};

var real__free = asm["_free"]; asm["_free"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real__free.apply(null, arguments);
};

var real____errno_location = asm["___errno_location"]; asm["___errno_location"] = function() {
assert(runtimeInitialized, 'you need to wait for the runtime to be ready (e.g. wait for main() to be called)');
assert(!runtimeExited, 'the runtime was exited (use NO_EXIT_RUNTIME to keep it alive after main() exits)');
return real____errno_location.apply(null, arguments);
};
var __GLOBAL__sub_I_object_cpp = Module["__GLOBAL__sub_I_object_cpp"] = asm["__GLOBAL__sub_I_object_cpp"];
var _fflush = Module["_fflush"] = asm["_fflush"];
var runPostSets = Module["runPostSets"] = asm["runPostSets"];
var _memset = Module["_memset"] = asm["_memset"];
var __GLOBAL__sub_I_object_type_db_cpp = Module["__GLOBAL__sub_I_object_type_db_cpp"] = asm["__GLOBAL__sub_I_object_type_db_cpp"];
var _malloc = Module["_malloc"] = asm["_malloc"];
var _memcpy = Module["_memcpy"] = asm["_memcpy"];
var __GLOBAL__sub_I_matrix3_cpp = Module["__GLOBAL__sub_I_matrix3_cpp"] = asm["__GLOBAL__sub_I_matrix3_cpp"];
var __GLOBAL__sub_I_resource_cpp = Module["__GLOBAL__sub_I_resource_cpp"] = asm["__GLOBAL__sub_I_resource_cpp"];
var _free = Module["_free"] = asm["_free"];
var ___errno_location = Module["___errno_location"] = asm["___errno_location"];
var dynCall_iiii = Module["dynCall_iiii"] = asm["dynCall_iiii"];
var dynCall_vi = Module["dynCall_vi"] = asm["dynCall_vi"];
var dynCall_vii = Module["dynCall_vii"] = asm["dynCall_vii"];
var dynCall_ii = Module["dynCall_ii"] = asm["dynCall_ii"];
var dynCall_viii = Module["dynCall_viii"] = asm["dynCall_viii"];
var dynCall_viiiiiii = Module["dynCall_viiiiiii"] = asm["dynCall_viiiiiii"];
;

Runtime.stackAlloc = asm['stackAlloc'];
Runtime.stackSave = asm['stackSave'];
Runtime.stackRestore = asm['stackRestore'];
Runtime.establishStackSpace = asm['establishStackSpace'];

Runtime.setTempRet0 = asm['setTempRet0'];
Runtime.getTempRet0 = asm['getTempRet0'];



// === Auto-generated postamble setup entry stuff ===




function ExitStatus(status) {
  this.name = "ExitStatus";
  this.message = "Program terminated with exit(" + status + ")";
  this.status = status;
};
ExitStatus.prototype = new Error();
ExitStatus.prototype.constructor = ExitStatus;

var initialStackTop;
var preloadStartTime = null;
var calledMain = false;

dependenciesFulfilled = function runCaller() {
  // If run has never been called, and we should call run (INVOKE_RUN is true, and Module.noInitialRun is not false)
  if (!Module['calledRun']) run();
  if (!Module['calledRun']) dependenciesFulfilled = runCaller; // try this again later, after new deps are fulfilled
}

Module['callMain'] = Module.callMain = function callMain(args) {
  assert(runDependencies == 0, 'cannot call main when async dependencies remain! (listen on __ATMAIN__)');
  assert(__ATPRERUN__.length == 0, 'cannot call main when preRun functions remain to be called');

  args = args || [];

  ensureInitRuntime();

  var argc = args.length+1;
  function pad() {
    for (var i = 0; i < 4-1; i++) {
      argv.push(0);
    }
  }
  var argv = [allocate(intArrayFromString(Module['thisProgram']), 'i8', ALLOC_NORMAL) ];
  pad();
  for (var i = 0; i < argc-1; i = i + 1) {
    argv.push(allocate(intArrayFromString(args[i]), 'i8', ALLOC_NORMAL));
    pad();
  }
  argv.push(0);
  argv = allocate(argv, 'i32', ALLOC_NORMAL);


  try {

    var ret = Module['_main'](argc, argv, 0);


    // if we're not running an evented main loop, it's time to exit
    exit(ret, /* implicit = */ true);
  }
  catch(e) {
    if (e instanceof ExitStatus) {
      // exit() throws this once it's done to make sure execution
      // has been stopped completely
      return;
    } else if (e == 'SimulateInfiniteLoop') {
      // running an evented main loop, don't immediately exit
      Module['noExitRuntime'] = true;
      return;
    } else {
      if (e && typeof e === 'object' && e.stack) Module.printErr('exception thrown: ' + [e, e.stack]);
      throw e;
    }
  } finally {
    calledMain = true;
  }
}




function run(args) {
  args = args || Module['arguments'];

  if (preloadStartTime === null) preloadStartTime = Date.now();

  if (runDependencies > 0) {
    Module.printErr('run() called, but dependencies remain, so not running');
    return;
  }

  preRun();

  if (runDependencies > 0) return; // a preRun added a dependency, run will be called later
  if (Module['calledRun']) return; // run may have just been called through dependencies being fulfilled just in this very frame

  function doRun() {
    if (Module['calledRun']) return; // run may have just been called while the async setStatus time below was happening
    Module['calledRun'] = true;

    if (ABORT) return; 

    ensureInitRuntime();

    preMain();

    if (ENVIRONMENT_IS_WEB && preloadStartTime !== null) {
      Module.printErr('pre-main prep time: ' + (Date.now() - preloadStartTime) + ' ms');
    }

    if (Module['onRuntimeInitialized']) Module['onRuntimeInitialized']();

    if (Module['_main'] && shouldRunNow) Module['callMain'](args);

    postRun();
  }

  if (Module['setStatus']) {
    Module['setStatus']('Running...');
    setTimeout(function() {
      setTimeout(function() {
        Module['setStatus']('');
      }, 1);
      doRun();
    }, 1);
  } else {
    doRun();
  }
}
Module['run'] = Module.run = run;

function exit(status, implicit) {
  if (implicit && Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') implicitly called by end of main(), but noExitRuntime, so not exiting the runtime (you can use emscripten_force_exit, if you want to force a true shutdown)');
    return;
  }

  if (Module['noExitRuntime']) {
    Module.printErr('exit(' + status + ') called, but noExitRuntime, so halting execution but not exiting the runtime or preventing further async execution (you can use emscripten_force_exit, if you want to force a true shutdown)');
  } else {

    ABORT = true;
    EXITSTATUS = status;
    STACKTOP = initialStackTop;

    exitRuntime();

    if (Module['onExit']) Module['onExit'](status);
  }

  if (ENVIRONMENT_IS_NODE) {
    process['exit'](status);
  } else if (ENVIRONMENT_IS_SHELL && typeof quit === 'function') {
    quit(status);
  }
  // if we reach here, we must throw an exception to halt the current execution
  throw new ExitStatus(status);
}
Module['exit'] = Module.exit = exit;

var abortDecorators = [];

function abort(what) {
  if (what !== undefined) {
    Module.print(what);
    Module.printErr(what);
    what = JSON.stringify(what)
  } else {
    what = '';
  }

  ABORT = true;
  EXITSTATUS = 1;

  var extra = '';

  var output = 'abort(' + what + ') at ' + stackTrace() + extra;
  if (abortDecorators) {
    abortDecorators.forEach(function(decorator) {
      output = decorator(output, what);
    });
  }
  throw output;
}
Module['abort'] = Module.abort = abort;

// {{PRE_RUN_ADDITIONS}}

if (Module['preInit']) {
  if (typeof Module['preInit'] == 'function') Module['preInit'] = [Module['preInit']];
  while (Module['preInit'].length > 0) {
    Module['preInit'].pop()();
  }
}

// shouldRunNow refers to calling main(), not run().
var shouldRunNow = true;
if (Module['noInitialRun']) {
  shouldRunNow = false;
}


run();

// {{POST_RUN_ADDITIONS}}






// {{MODULE_ADDITIONS}}



