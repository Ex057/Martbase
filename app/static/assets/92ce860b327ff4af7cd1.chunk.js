/*! For license information please see 92ce860b327ff4af7cd1.chunk.js.LICENSE.txt */
(globalThis.webpackChunksuperset=globalThis.webpackChunksuperset||[]).push([[1119],{7452:e=>{var t=function(e){"use strict";var t,r=Object.prototype,n=r.hasOwnProperty,o=Object.defineProperty||function(e,t,r){e[t]=r.value},i="function"==typeof Symbol?Symbol:{},l=i.iterator||"@@iterator",a=i.asyncIterator||"@@asyncIterator",c=i.toStringTag||"@@toStringTag";function s(e,t,r){return Object.defineProperty(e,t,{value:r,enumerable:!0,configurable:!0,writable:!0}),e[t]}try{s({},"")}catch(e){s=function(e,t,r){return e[t]=r}}function u(e,t,r,n){var i=t&&t.prototype instanceof y?t:y,l=Object.create(i.prototype),a=new Y(n||[]);return o(l,"_invoke",{value:A(e,r,a)}),l}function d(e,t,r){try{return{type:"normal",arg:e.call(t,r)}}catch(e){return{type:"throw",arg:e}}}e.wrap=u;var h="suspendedStart",p="suspendedYield",g="executing",f="completed",m={};function y(){}function v(){}function b(){}var w={};s(w,l,function(){return this});var S=Object.getPrototypeOf,k=S&&S(S(M([])));k&&k!==r&&n.call(k,l)&&(w=k);var C=b.prototype=y.prototype=Object.create(w);function x(e){["next","throw","return"].forEach(function(t){s(e,t,function(e){return this._invoke(t,e)})})}function E(e,t){function r(o,i,l,a){var c=d(e[o],e,i);if("throw"!==c.type){var s=c.arg,u=s.value;return u&&"object"==typeof u&&n.call(u,"__await")?t.resolve(u.__await).then(function(e){r("next",e,l,a)},function(e){r("throw",e,l,a)}):t.resolve(u).then(function(e){s.value=e,l(s)},function(e){return r("throw",e,l,a)})}a(c.arg)}var i;o(this,"_invoke",{value:function(e,n){function o(){return new t(function(t,o){r(e,n,t,o)})}return i=i?i.then(o,o):o()}})}function A(e,r,n){var o=h;return function(i,l){if(o===g)throw new Error("Generator is already running");if(o===f){if("throw"===i)throw l;return{value:t,done:!0}}for(n.method=i,n.arg=l;;){var a=n.delegate;if(a){var c=N(a,n);if(c){if(c===m)continue;return c}}if("next"===n.method)n.sent=n._sent=n.arg;else if("throw"===n.method){if(o===h)throw o=f,n.arg;n.dispatchException(n.arg)}else"return"===n.method&&n.abrupt("return",n.arg);o=g;var s=d(e,r,n);if("normal"===s.type){if(o=n.done?f:p,s.arg===m)continue;return{value:s.arg,done:n.done}}"throw"===s.type&&(o=f,n.method="throw",n.arg=s.arg)}}}function N(e,r){var n=r.method,o=e.iterator[n];if(o===t)return r.delegate=null,"throw"===n&&e.iterator.return&&(r.method="return",r.arg=t,N(e,r),"throw"===r.method)||"return"!==n&&(r.method="throw",r.arg=new TypeError("The iterator does not provide a '"+n+"' method")),m;var i=d(o,e.iterator,r.arg);if("throw"===i.type)return r.method="throw",r.arg=i.arg,r.delegate=null,m;var l=i.arg;return l?l.done?(r[e.resultName]=l.value,r.next=e.nextLoc,"return"!==r.method&&(r.method="next",r.arg=t),r.delegate=null,m):l:(r.method="throw",r.arg=new TypeError("iterator result is not an object"),r.delegate=null,m)}function O(e){var t={tryLoc:e[0]};1 in e&&(t.catchLoc=e[1]),2 in e&&(t.finallyLoc=e[2],t.afterLoc=e[3]),this.tryEntries.push(t)}function T(e){var t=e.completion||{};t.type="normal",delete t.arg,e.completion=t}function Y(e){this.tryEntries=[{tryLoc:"root"}],e.forEach(O,this),this.reset(!0)}function M(e){if(null!=e){var r=e[l];if(r)return r.call(e);if("function"==typeof e.next)return e;if(!isNaN(e.length)){var o=-1,i=function r(){for(;++o<e.length;)if(n.call(e,o))return r.value=e[o],r.done=!1,r;return r.value=t,r.done=!0,r};return i.next=i}}throw new TypeError(typeof e+" is not iterable")}return v.prototype=b,o(C,"constructor",{value:b,configurable:!0}),o(b,"constructor",{value:v,configurable:!0}),v.displayName=s(b,c,"GeneratorFunction"),e.isGeneratorFunction=function(e){var t="function"==typeof e&&e.constructor;return!!t&&(t===v||"GeneratorFunction"===(t.displayName||t.name))},e.mark=function(e){return Object.setPrototypeOf?Object.setPrototypeOf(e,b):(e.__proto__=b,s(e,c,"GeneratorFunction")),e.prototype=Object.create(C),e},e.awrap=function(e){return{__await:e}},x(E.prototype),s(E.prototype,a,function(){return this}),e.AsyncIterator=E,e.async=function(t,r,n,o,i){void 0===i&&(i=Promise);var l=new E(u(t,r,n,o),i);return e.isGeneratorFunction(r)?l:l.next().then(function(e){return e.done?e.value:l.next()})},x(C),s(C,c,"Generator"),s(C,l,function(){return this}),s(C,"toString",function(){return"[object Generator]"}),e.keys=function(e){var t=Object(e),r=[];for(var n in t)r.push(n);return r.reverse(),function e(){for(;r.length;){var n=r.pop();if(n in t)return e.value=n,e.done=!1,e}return e.done=!0,e}},e.values=M,Y.prototype={constructor:Y,reset:function(e){if(this.prev=0,this.next=0,this.sent=this._sent=t,this.done=!1,this.delegate=null,this.method="next",this.arg=t,this.tryEntries.forEach(T),!e)for(var r in this)"t"===r.charAt(0)&&n.call(this,r)&&!isNaN(+r.slice(1))&&(this[r]=t)},stop:function(){this.done=!0;var e=this.tryEntries[0].completion;if("throw"===e.type)throw e.arg;return this.rval},dispatchException:function(e){if(this.done)throw e;var r=this;function o(n,o){return a.type="throw",a.arg=e,r.next=n,o&&(r.method="next",r.arg=t),!!o}for(var i=this.tryEntries.length-1;i>=0;--i){var l=this.tryEntries[i],a=l.completion;if("root"===l.tryLoc)return o("end");if(l.tryLoc<=this.prev){var c=n.call(l,"catchLoc"),s=n.call(l,"finallyLoc");if(c&&s){if(this.prev<l.catchLoc)return o(l.catchLoc,!0);if(this.prev<l.finallyLoc)return o(l.finallyLoc)}else if(c){if(this.prev<l.catchLoc)return o(l.catchLoc,!0)}else{if(!s)throw new Error("try statement without catch or finally");if(this.prev<l.finallyLoc)return o(l.finallyLoc)}}}},abrupt:function(e,t){for(var r=this.tryEntries.length-1;r>=0;--r){var o=this.tryEntries[r];if(o.tryLoc<=this.prev&&n.call(o,"finallyLoc")&&this.prev<o.finallyLoc){var i=o;break}}i&&("break"===e||"continue"===e)&&i.tryLoc<=t&&t<=i.finallyLoc&&(i=null);var l=i?i.completion:{};return l.type=e,l.arg=t,i?(this.method="next",this.next=i.finallyLoc,m):this.complete(l)},complete:function(e,t){if("throw"===e.type)throw e.arg;return"break"===e.type||"continue"===e.type?this.next=e.arg:"return"===e.type?(this.rval=this.arg=e.arg,this.method="return",this.next="end"):"normal"===e.type&&t&&(this.next=t),m},finish:function(e){for(var t=this.tryEntries.length-1;t>=0;--t){var r=this.tryEntries[t];if(r.finallyLoc===e)return this.complete(r.completion,r.afterLoc),T(r),m}},catch:function(e){for(var t=this.tryEntries.length-1;t>=0;--t){var r=this.tryEntries[t];if(r.tryLoc===e){var n=r.completion;if("throw"===n.type){var o=n.arg;T(r)}return o}}throw new Error("illegal catch attempt")},delegateYield:function(e,r,n){return this.delegate={iterator:M(e),resultName:r,nextLoc:n},"next"===this.method&&(this.arg=t),m}},e}(e.exports);try{regeneratorRuntime=t}catch(e){"object"==typeof globalThis?globalThis.regeneratorRuntime=t:Function("r","regeneratorRuntime = r")(t)}},35697:(e,t,r)=>{var n=r(75972).k5;e.exports.X=function(e){return n({tag:"svg",attr:{viewBox:"0 0 320 512"},child:[{tag:"path",attr:{d:"M279 224H41c-21.4 0-32.1-25.9-17-41L143 64c9.4-9.4 24.6-9.4 33.9 0l119 119c15.2 15.1 4.5 41-16.9 41z"}}]})(e)}},51545:(e,t,r)=>{"use strict";r.d(t,{Ht:()=>a,cG:()=>i});var n=r(70731),o=r.n(n);const i={CASE_SENSITIVE_EQUAL:7,EQUAL:6,STARTS_WITH:5,WORD_STARTS_WITH:4,CONTAINS:3,ACRONYM:2,MATCHES:1,NO_MATCH:0},l=(e,t)=>String(e.rankedValue).localeCompare(String(t.rankedValue));function a(e,t,r){void 0===r&&(r={});const{keys:n,threshold:o=i.MATCHES,baseSort:a=l,sorter:u=e=>e.sort((e,t)=>s(e,t,a))}=r,h=e.reduce(function(e,l,a){const s=function(e,t,r,n){if(!t)return{rankedValue:e,rank:c(e,r,n),keyIndex:-1,keyThreshold:n.threshold};const o=function(e,t){const r=[];for(let n=0,o=t.length;n<o;n++){const o=t[n],i=p(o),l=d(e,o);for(let e=0,t=l.length;e<t;e++)r.push({itemValue:l[e],attributes:i})}return r}(e,t);return o.reduce((e,t,o)=>{let{rank:l,rankedValue:a,keyIndex:s,keyThreshold:u}=e,{itemValue:d,attributes:h}=t,p=c(d,r,n),g=a;const{minRanking:f,maxRanking:m,threshold:y}=h;return p<f&&p>=i.MATCHES?p=f:p>m&&(p=m),p>l&&(l=p,s=o,u=y,g=d),{rankedValue:g,rank:l,keyIndex:s,keyThreshold:u}},{rankedValue:e,rank:i.NO_MATCH,keyIndex:-1,keyThreshold:n.threshold})}(l,n,t,r),{rank:u,keyThreshold:h=o}=s;return u>=h&&e.push({...s,item:l,index:a}),e},[]);return u(h).map(e=>{let{item:t}=e;return t})}function c(e,t,r){return e=u(e,r),(t=u(t,r)).length>e.length?i.NO_MATCH:e===t?i.CASE_SENSITIVE_EQUAL:(e=e.toLowerCase())===(t=t.toLowerCase())?i.EQUAL:e.startsWith(t)?i.STARTS_WITH:e.includes(` ${t}`)?i.WORD_STARTS_WITH:e.includes(t)?i.CONTAINS:1===t.length?i.NO_MATCH:function(e){let t="";return e.split(" ").forEach(e=>{e.split("-").forEach(e=>{t+=e.substr(0,1)})}),t}(e).includes(t)?i.ACRONYM:function(e,t){let r=0,n=0;function o(e,t,n){for(let o=n,i=t.length;o<i;o++)if(t[o]===e)return r+=1,o+1;return-1}const l=o(t[0],e,0);if(l<0)return i.NO_MATCH;n=l;for(let r=1,l=t.length;r<l;r++)if(n=o(t[r],e,n),!(n>-1))return i.NO_MATCH;return function(e){const n=1/e,o=r/t.length;return i.MATCHES+o*n}(n-l)}(e,t)}function s(e,t,r){const{rank:n,keyIndex:o}=e,{rank:i,keyIndex:l}=t;return n===i?o===l?r(e,t):o<l?-1:1:n>i?-1:1}function u(e,t){let{keepDiacritics:r}=t;return e=`${e}`,r||(e=o()(e)),e}function d(e,t){let r;if("object"==typeof t&&(t=t.key),"function"==typeof t)r=t(e);else if(null==e)r=null;else if(Object.hasOwnProperty.call(e,t))r=e[t];else{if(t.includes("."))return function(e,t){const r=e.split(".");let n=[t];for(let e=0,t=r.length;e<t;e++){const t=r[e];let o=[];for(let e=0,r=n.length;e<r;e++){const r=n[e];if(null!=r)if(Object.hasOwnProperty.call(r,t)){const e=r[t];null!=e&&o.push(e)}else"*"===t&&(o=o.concat(r))}n=o}return Array.isArray(n[0])?[].concat(...n):n}(t,e);r=null}return null==r?[]:Array.isArray(r)?r:[String(r)]}a.rankings=i;const h={maxRanking:1/0,minRanking:-1/0};function p(e){return"string"==typeof e?h:{...h,...e}}},69856:(e,t,r)=>{var n=r(75972).k5;e.exports.M=function(e){return n({tag:"svg",attr:{viewBox:"0 0 320 512"},child:[{tag:"path",attr:{d:"M41 288h238c21.4 0 32.1 25.9 17 41L177 448c-9.4 9.4-24.6 9.4-33.9 0L24 329c-15.1-15.1-4.4-41 17-41zm255-105L177 64c-9.4-9.4-24.6-9.4-33.9 0L24 183c-15.1 15.1-4.4 41 17 41h238c21.4 0 32.1-25.9 17-41z"}}]})(e)}},70731:e=>{var t={À:"A",Á:"A",Â:"A",Ã:"A",Ä:"A",Å:"A",Ấ:"A",Ắ:"A",Ẳ:"A",Ẵ:"A",Ặ:"A",Æ:"AE",Ầ:"A",Ằ:"A",Ȃ:"A",Ả:"A",Ạ:"A",Ẩ:"A",Ẫ:"A",Ậ:"A",Ç:"C",Ḉ:"C",È:"E",É:"E",Ê:"E",Ë:"E",Ế:"E",Ḗ:"E",Ề:"E",Ḕ:"E",Ḝ:"E",Ȇ:"E",Ẻ:"E",Ẽ:"E",Ẹ:"E",Ể:"E",Ễ:"E",Ệ:"E",Ì:"I",Í:"I",Î:"I",Ï:"I",Ḯ:"I",Ȋ:"I",Ỉ:"I",Ị:"I",Ð:"D",Ñ:"N",Ò:"O",Ó:"O",Ô:"O",Õ:"O",Ö:"O",Ø:"O",Ố:"O",Ṍ:"O",Ṓ:"O",Ȏ:"O",Ỏ:"O",Ọ:"O",Ổ:"O",Ỗ:"O",Ộ:"O",Ờ:"O",Ở:"O",Ỡ:"O",Ớ:"O",Ợ:"O",Ù:"U",Ú:"U",Û:"U",Ü:"U",Ủ:"U",Ụ:"U",Ử:"U",Ữ:"U",Ự:"U",Ý:"Y",à:"a",á:"a",â:"a",ã:"a",ä:"a",å:"a",ấ:"a",ắ:"a",ẳ:"a",ẵ:"a",ặ:"a",æ:"ae",ầ:"a",ằ:"a",ȃ:"a",ả:"a",ạ:"a",ẩ:"a",ẫ:"a",ậ:"a",ç:"c",ḉ:"c",è:"e",é:"e",ê:"e",ë:"e",ế:"e",ḗ:"e",ề:"e",ḕ:"e",ḝ:"e",ȇ:"e",ẻ:"e",ẽ:"e",ẹ:"e",ể:"e",ễ:"e",ệ:"e",ì:"i",í:"i",î:"i",ï:"i",ḯ:"i",ȋ:"i",ỉ:"i",ị:"i",ð:"d",ñ:"n",ò:"o",ó:"o",ô:"o",õ:"o",ö:"o",ø:"o",ố:"o",ṍ:"o",ṓ:"o",ȏ:"o",ỏ:"o",ọ:"o",ổ:"o",ỗ:"o",ộ:"o",ờ:"o",ở:"o",ỡ:"o",ớ:"o",ợ:"o",ù:"u",ú:"u",û:"u",ü:"u",ủ:"u",ụ:"u",ử:"u",ữ:"u",ự:"u",ý:"y",ÿ:"y",Ā:"A",ā:"a",Ă:"A",ă:"a",Ą:"A",ą:"a",Ć:"C",ć:"c",Ĉ:"C",ĉ:"c",Ċ:"C",ċ:"c",Č:"C",č:"c",C̆:"C",c̆:"c",Ď:"D",ď:"d",Đ:"D",đ:"d",Ē:"E",ē:"e",Ĕ:"E",ĕ:"e",Ė:"E",ė:"e",Ę:"E",ę:"e",Ě:"E",ě:"e",Ĝ:"G",Ǵ:"G",ĝ:"g",ǵ:"g",Ğ:"G",ğ:"g",Ġ:"G",ġ:"g",Ģ:"G",ģ:"g",Ĥ:"H",ĥ:"h",Ħ:"H",ħ:"h",Ḫ:"H",ḫ:"h",Ĩ:"I",ĩ:"i",Ī:"I",ī:"i",Ĭ:"I",ĭ:"i",Į:"I",į:"i",İ:"I",ı:"i",Ĳ:"IJ",ĳ:"ij",Ĵ:"J",ĵ:"j",Ķ:"K",ķ:"k",Ḱ:"K",ḱ:"k",K̆:"K",k̆:"k",Ĺ:"L",ĺ:"l",Ļ:"L",ļ:"l",Ľ:"L",ľ:"l",Ŀ:"L",ŀ:"l",Ł:"l",ł:"l",Ḿ:"M",ḿ:"m",M̆:"M",m̆:"m",Ń:"N",ń:"n",Ņ:"N",ņ:"n",Ň:"N",ň:"n",ŉ:"n",N̆:"N",n̆:"n",Ō:"O",ō:"o",Ŏ:"O",ŏ:"o",Ő:"O",ő:"o",Œ:"OE",œ:"oe",P̆:"P",p̆:"p",Ŕ:"R",ŕ:"r",Ŗ:"R",ŗ:"r",Ř:"R",ř:"r",R̆:"R",r̆:"r",Ȓ:"R",ȓ:"r",Ś:"S",ś:"s",Ŝ:"S",ŝ:"s",Ş:"S",Ș:"S",ș:"s",ş:"s",Š:"S",š:"s",Ţ:"T",ţ:"t",ț:"t",Ț:"T",Ť:"T",ť:"t",Ŧ:"T",ŧ:"t",T̆:"T",t̆:"t",Ũ:"U",ũ:"u",Ū:"U",ū:"u",Ŭ:"U",ŭ:"u",Ů:"U",ů:"u",Ű:"U",ű:"u",Ų:"U",ų:"u",Ȗ:"U",ȗ:"u",V̆:"V",v̆:"v",Ŵ:"W",ŵ:"w",Ẃ:"W",ẃ:"w",X̆:"X",x̆:"x",Ŷ:"Y",ŷ:"y",Ÿ:"Y",Y̆:"Y",y̆:"y",Ź:"Z",ź:"z",Ż:"Z",ż:"z",Ž:"Z",ž:"z",ſ:"s",ƒ:"f",Ơ:"O",ơ:"o",Ư:"U",ư:"u",Ǎ:"A",ǎ:"a",Ǐ:"I",ǐ:"i",Ǒ:"O",ǒ:"o",Ǔ:"U",ǔ:"u",Ǖ:"U",ǖ:"u",Ǘ:"U",ǘ:"u",Ǚ:"U",ǚ:"u",Ǜ:"U",ǜ:"u",Ứ:"U",ứ:"u",Ṹ:"U",ṹ:"u",Ǻ:"A",ǻ:"a",Ǽ:"AE",ǽ:"ae",Ǿ:"O",ǿ:"o",Þ:"TH",þ:"th",Ṕ:"P",ṕ:"p",Ṥ:"S",ṥ:"s",X́:"X",x́:"x",Ѓ:"Г",ѓ:"г",Ќ:"К",ќ:"к",A̋:"A",a̋:"a",E̋:"E",e̋:"e",I̋:"I",i̋:"i",Ǹ:"N",ǹ:"n",Ồ:"O",ồ:"o",Ṑ:"O",ṑ:"o",Ừ:"U",ừ:"u",Ẁ:"W",ẁ:"w",Ỳ:"Y",ỳ:"y",Ȁ:"A",ȁ:"a",Ȅ:"E",ȅ:"e",Ȉ:"I",ȉ:"i",Ȍ:"O",ȍ:"o",Ȑ:"R",ȑ:"r",Ȕ:"U",ȕ:"u",B̌:"B",b̌:"b",Č̣:"C",č̣:"c",Ê̌:"E",ê̌:"e",F̌:"F",f̌:"f",Ǧ:"G",ǧ:"g",Ȟ:"H",ȟ:"h",J̌:"J",ǰ:"j",Ǩ:"K",ǩ:"k",M̌:"M",m̌:"m",P̌:"P",p̌:"p",Q̌:"Q",q̌:"q",Ř̩:"R",ř̩:"r",Ṧ:"S",ṧ:"s",V̌:"V",v̌:"v",W̌:"W",w̌:"w",X̌:"X",x̌:"x",Y̌:"Y",y̌:"y",A̧:"A",a̧:"a",B̧:"B",b̧:"b",Ḑ:"D",ḑ:"d",Ȩ:"E",ȩ:"e",Ɛ̧:"E",ɛ̧:"e",Ḩ:"H",ḩ:"h",I̧:"I",i̧:"i",Ɨ̧:"I",ɨ̧:"i",M̧:"M",m̧:"m",O̧:"O",o̧:"o",Q̧:"Q",q̧:"q",U̧:"U",u̧:"u",X̧:"X",x̧:"x",Z̧:"Z",z̧:"z",й:"и",Й:"И",ё:"е",Ё:"Е"},r=Object.keys(t).join("|"),n=new RegExp(r,"g"),o=new RegExp(r,"");function i(e){return t[e]}var l=function(e){return e.replace(n,i)};e.exports=l,e.exports.has=function(e){return!!e.match(o)},e.exports.remove=l},75972:(e,t,r)=>{"use strict";r.d(t,{k5:()=>u});var n=r(24002),o=r.n(n),i={color:void 0,size:void 0,className:void 0,style:void 0,attr:void 0},l=o().createContext&&o().createContext(i),a=function(){return a=Object.assign||function(e){for(var t,r=1,n=arguments.length;r<n;r++)for(var o in t=arguments[r])Object.prototype.hasOwnProperty.call(t,o)&&(e[o]=t[o]);return e},a.apply(this,arguments)},c=function(e,t){var r={};for(var n in e)Object.prototype.hasOwnProperty.call(e,n)&&t.indexOf(n)<0&&(r[n]=e[n]);if(null!=e&&"function"==typeof Object.getOwnPropertySymbols){var o=0;for(n=Object.getOwnPropertySymbols(e);o<n.length;o++)t.indexOf(n[o])<0&&Object.prototype.propertyIsEnumerable.call(e,n[o])&&(r[n[o]]=e[n[o]])}return r};function s(e){return e&&e.map(function(e,t){return o().createElement(e.tag,a({key:t},e.attr),s(e.child))})}function u(e){return function(t){return o().createElement(d,a({attr:a({},e.attr)},t),s(e.child))}}function d(e){var t=function(t){var r,n=e.attr,i=e.size,l=e.title,s=c(e,["attr","size","title"]),u=i||t.size||"1em";return t.className&&(r=t.className),e.className&&(r=(r?r+" ":"")+e.className),o().createElement("svg",a({stroke:"currentColor",fill:"currentColor",strokeWidth:"0"},t.attr,n,s,{className:r,style:a(a({color:e.color||t.color},t.style),e.style),height:u,width:u,xmlns:"http://www.w3.org/2000/svg"}),l&&o().createElement("title",null,l),e.children)};return void 0!==l?o().createElement(l.Consumer,null,function(e){return t(e)}):t(i)}},77796:(e,t,r)=>{var n=r(75972).k5;e.exports.G=function(e){return n({tag:"svg",attr:{viewBox:"0 0 320 512"},child:[{tag:"path",attr:{d:"M41 288h238c21.4 0 32.1 25.9 17 41L177 448c-9.4 9.4-24.6 9.4-33.9 0L24 329c-15.1-15.1-4.4-41 17-41z"}}]})(e)}},85173:(e,t,r)=>{"use strict";r.d(t,{v:()=>n});const n=r(24002).memo},91119:(e,t,r)=>{"use strict";r.r(t),r.d(t,{default:()=>Ce});var n=r(2404),o=r.n(n),i=r(38221),l=r.n(i),a=r(62193),c=r.n(a),s=r(2445),u=r(24002);function d(e,t){let r;if(void 0===t)for(const t of e)null!=t&&(r<t||void 0===r&&t>=t)&&(r=t);else{let n=-1;for(let o of e)null!=(o=t(o,++n,e))&&(r<o||void 0===r&&o>=o)&&(r=o)}return r}var h=r(69856),p=r(77796),g=r(35697),f=r(46942),m=r.n(f),y=r(81465),v=r(74098),b=r(17437),w=r(58083),S=r(31463),k=r(90924),C=r(95021),x=r(58516),E=r(29645),A=r(28827),N=r(95018),O=r(26067),T=r(13341),Y=r(14103),M=r(39822),I=r(35709),$=r(29248),P=r(96254),F=r(85173),R=r(67413),D=r(32885),L=r(51545),z=r(76576);r(7452);const H=new Map;function B({count:e,value:t,onChange:r,onBlur:n,inputRef:o}){return(0,s.FD)(E.Space,{direction:"horizontal",size:4,className:"dt-global-filter",children:["Search",(0,s.Y)(E.Input,{size:"small",ref:o,placeholder:`${e} records...`,value:t,onChange:r,onBlur:n,className:"form-control input-sm"})]})}const j=(0,u.memo)(function({preGlobalFilteredRows:e,filterValue:t="",searchInput:r,setGlobalFilter:n,id:o="",serverPagination:i,rowCount:l}){const a=i?l:e.length,c=(0,u.useRef)(null),[d,h]=function(e,t,r=200){const[n,o]=(0,u.useState)(e),i=(0,u.useRef)(e),l=(0,D.useAsyncDebounce)(t,r);return i.current!==e&&(i.current=e,n!==e&&o(e)),[n,e=>{o(e),l(e)}]}(t,e=>{n(e||void 0)},200);(0,u.useEffect)(()=>{var e;i&&H.get(o)&&document.activeElement!==c.current&&(null==(e=c.current)||e.focus())},[d,i]);const p=r||B;return(0,s.Y)(p,{count:a,value:d,inputRef:c,onChange:e=>{const t=e.target;e.preventDefault(),H.set(o,!0),h(t.value)},onBlur:()=>{H.set(o,!1)}})});var U=r(20259);function G({current:e,options:t,onChange:r}){const{Option:n}=E.Select;return(0,s.FD)("span",{className:"dt-select-page-size form-inline",children:[(0,v.t)("Show")," ",(0,s.Y)(E.Select,{value:e,onChange:e=>r(e),size:"small",css:e=>b.AH`
          width: ${18*e.sizeUnit}px;
        `,children:t.map(e=>{const[t,r]=Array.isArray(e)?e:[e,e],o=0===t?(0,v.t)("all"):t;return(0,s.Y)(n,{value:Number(t),"aria-label":(0,v.t)("Show %s entries",o),children:r},t)})})," ",(0,v.t)("entries")]})}function _(e){return Array.isArray(e)?e[0]:e}const W=(0,u.memo)(function({total:e,options:t,current:r,selectRenderer:n,onChange:o}){const i=t.map(_);let l=[...t];void 0===r||r===e&&i.includes(0)||i.includes(r)||(l=[...t],l.splice(i.findIndex(e=>e>r),0,(0,U.u)([r])[0]));const a=void 0===r?i[0]:r,c=n||G;return(0,s.Y)(c,{current:a,options:l,onChange:o})}),V=(0,u.memo)((0,u.forwardRef)(function({style:e,pageCount:t,currentPage:r=0,maxPageItemCount:n=9,onPageChange:o},i){const l=function(e,t,r){if(r<7)throw new Error("Must allow at least 7 page items");if(r%2==0)throw new Error("Must allow odd number of page items");if(e<r)return[...new Array(e).keys()];const n=Math.max(0,Math.min(e-r,t-Math.floor(r/2))),o=new Array(r);for(let e=0;e<r;e+=1)o[e]=e+n;"number"==typeof o[0]&&o[0]>0&&(o[0]=0,o[1]="prev-more");const i=o[o.length-1];return"number"==typeof i&&i<e-1&&(o[o.length-1]=e-1,o[o.length-2]="next-more"),o}(t,r,n);return(0,s.Y)("div",{ref:i,className:"dt-pagination",style:e,children:(0,s.Y)("ul",{className:"pagination pagination-sm",children:l.map(e=>"number"==typeof e?(0,s.Y)("li",{className:r===e?"active":void 0,children:(0,s.Y)("a",{href:`#page-${e}`,role:"button",onClick:t=>{t.preventDefault(),o(e)},children:e+1})},e):(0,s.Y)("li",{className:"dt-pagination-ellipsis",children:(0,s.Y)("span",{children:"…"})},e))})})}));let X;const K=e=>e.join("\n");function Q(e=!1){if("undefined"==typeof document)return 0;if(void 0===X||e){const e=document.createElement("div"),t=document.createElement("div");e.style.cssText=K`
      width: auto;
      height: 100%;
      overflow: scroll;
    `,t.style.cssText=K`
      position: absolute;
      visibility: hidden;
      overflow: hidden;
      width: 100px;
      height: 50px;
    `,t.append(e),document.body.append(t),X=t.clientWidth-e.clientWidth,t.remove()}return X}var Z;!function(e){e.Init="init",e.SetStickyState="setStickyState"}(Z||(Z={}));const J=(e,t)=>e+t,q=(e,t)=>({style:{...e.props.style,...t}}),ee={tableLayout:"fixed"};function te({sticky:e={},width:t,height:r,children:n,setStickyState:o}){const i=(0,y.DP)();if(!n||"table"!==n.type)throw new Error("<StickyWrap> must have only one <table> element as child");let l,a,c;if(u.Children.forEach(n.props.children,e=>{e&&("thead"===e.type?l=e:"tbody"===e.type?a=e:"tfoot"===e.type&&(c=e))}),!l||!a)throw new Error("<table> in <StickyWrap> must contain both thead and tbody.");const d=(0,u.useMemo)(()=>{var e;return u.Children.toArray(null==(e=l)?void 0:e.props.children).pop().props.children.length},[l]),h=(0,u.useRef)(null),p=(0,u.useRef)(null),g=(0,u.useRef)(null),f=(0,u.useRef)(null),m=(0,u.useRef)(null),v=Q(),{bodyHeight:w,columnWidths:S}=e,k=!S||e.width!==t||e.height!==r||e.setStickyState!==o;let C,x,E,A;(0,u.useLayoutEffect)(()=>{var e,n;if(!h.current)return;const i=h.current,l=i.clientHeight,a=p.current?p.current.clientHeight:0;if(!l)return;const c=i.parentNode.clientHeight,s=null==(e=i.childNodes)?void 0:e[(null==(n=i.childNodes)?void 0:n.length)-1||0].childNodes,u=Array.from(s).map(e=>{var t;return(null==(t=e.getBoundingClientRect())?void 0:t.width)||e.clientWidth}),[d,g]=function({width:e,height:t,innerHeight:r,innerWidth:n,scrollBarSize:o}){const i=r>t;return[i,n>e-(i?o:0)]}({width:t,height:r-l-a,innerHeight:c,innerWidth:u.reduce(J),scrollBarSize:v}),f=Math.min(r,g?c+v:c);o({hasVerticalScroll:d,hasHorizontalScroll:g,setStickyState:o,width:t,height:r,realHeight:f,tableHeight:c,bodyHeight:f-l-a,columnWidths:u})},[t,r,o,v]);const N=b.AH`
    &::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    &::-webkit-scrollbar-track {
      background: ${i.colorFillQuaternary};
    }
    &::-webkit-scrollbar-thumb {
      background: ${i.colorFillSecondary};
      border-radius: ${i.borderRadiusSM}px;
      &:hover {
        background: ${i.colorFillTertiary};
      }
    }
    &::-webkit-scrollbar-corner {
      background: ${i.colorFillQuaternary};
    }
  `;if(k){const e=(0,u.cloneElement)(l,{ref:h}),t=c&&(0,u.cloneElement)(c,{ref:p});C=(0,s.Y)("div",{style:{height:r,overflow:"auto",visibility:"hidden",scrollbarGutter:"stable"},css:N,role:"presentation",children:(0,u.cloneElement)(n,{role:"presentation"},e,a,t)},"sizer")}const O=null==S?void 0:S.slice(0,d);if(O&&w){const t=(0,s.Y)("colgroup",{children:O.map((e,t)=>(0,s.Y)("col",{width:e},t))});x=(0,s.FD)("div",{ref:g,style:{overflow:"hidden",scrollbarGutter:"stable"},role:"presentation",children:[(0,u.cloneElement)((0,u.cloneElement)(n,{role:"presentation"}),q(n,ee),t,l),x]},"header"),E=c&&(0,s.FD)("div",{ref:f,style:{overflow:"hidden",scrollbarGutter:"stable"},role:"presentation",children:[(0,u.cloneElement)((0,u.cloneElement)(n,{role:"presentation"}),q(n,ee),t,c),E]},"footer");const r=e=>{g.current&&(g.current.scrollLeft=e.currentTarget.scrollLeft),f.current&&(f.current.scrollLeft=e.currentTarget.scrollLeft)};A=(0,s.Y)("div",{ref:m,style:{height:w,overflow:"auto",scrollbarGutter:"stable"},css:N,onScroll:e.hasHorizontalScroll?r:void 0,role:"presentation",children:(0,u.cloneElement)((0,u.cloneElement)(n,{role:"presentation"}),q(n,ee),t,a)},"body")}return(0,s.FD)("div",{style:{width:t,height:e.realHeight||r,overflow:"hidden"},role:"table",children:[x,A,E,C]})}function re(e){const{dispatch:t,state:{sticky:r},data:n,page:o,rows:i,allColumns:l,getTableSize:a=()=>{}}=e,c=(0,u.useCallback)(e=>{t({type:Z.SetStickyState,size:e})},[t,a,o,i]);Object.assign(e,{setStickyState:c,wrapStickyTable:e=>{const{width:t,height:d}=function(e,t){const r=(0,u.useRef)();return(0,u.useLayoutEffect)(()=>{r.current=e}),(0,u.useMemo)(()=>{if(r.current)return e()},[r.current,r.current===e,...t||[]])}(a,[a])||r,h=(0,u.useMemo)(e,[o,i,l]);return(0,u.useLayoutEffect)(()=>{t&&d||c()},[t,d]),t&&d?0===n.length?h:(0,s.Y)(te,{width:t,height:d,sticky:r,setStickyState:c,children:h}):null}})}function ne(e){e.useInstance.push(re),e.stateReducers.push((e,t,r)=>{const n=t;if(n.type===Z.Init)return{...e,sticky:{...null==r?void 0:r.sticky}};if(n.type===Z.SetStickyState){const{size:t}=n;return t?{...e,sticky:{...null==r?void 0:r.sticky,...null==e?void 0:e.sticky,...n.size}}:{...e}}return e})}ne.pluginName="useSticky";var oe=r(68235);const ie=(0,y.I4)(E.Select)`
  width: 120px;
  margin-right: 8px;
`,le=function({value:e,onChange:t,searchOptions:r}){var n,o;return(0,s.Y)(ie,{className:"search-select",value:e||(null!=(n=null==r||null==(o=r[0])?void 0:o.value)?n:""),options:r,onChange:t})},ae={alphanumeric:(e,t,r)=>{const n=e.values[r],o=t.values[r];return n&&"string"==typeof n?o&&"string"==typeof o?n.localeCompare(o):1:-1}},ce=(0,F.v)(function({tableClassName:e,columns:t,data:r,serverPaginationData:n,width:i="100%",height:l=300,pageSize:a=0,initialState:c={},pageSizeOptions:d=oe.x,maxPageItemCount:h=9,sticky:p,searchInput:g=!0,onServerPaginationChange:f,rowCount:m,selectPageSize:y,noResults:v="No data found",hooks:b,serverPagination:w,wrapperRef:S,onColumnOrderChange:k,renderGroupingHeaders:C,renderTimeComparisonDropdown:x,handleSortByChange:A,sortByFromParent:N=[],manualSearch:O=!1,onSearchChange:T,initialSearchText:Y,searchInputId:M,onSearchColChange:I,searchOptions:$,...P}){const F=[D.useGlobalFilter,D.useSortBy,D.usePagination,D.useColumnOrder,p?ne:[],b||[]].flat(),H=Object.keys((null==r?void 0:r[0])||{}),B=(0,R.Z)(H),U=w?m:r.length,G=(0,u.useRef)([]),_=(0,u.useRef)([a,U]),X=a>0&&U>0,K=X||!!g||x,Q={...c,sortBy:w?N:G.current,pageSize:a>0?a:U||10},Z=(0,u.useRef)(null),J=(0,u.useRef)(null),q=(0,u.useRef)(null),ee=S||Z,te=JSON.stringify(n),re=(0,u.useCallback)(()=>{var e,t;if(ee.current)return{width:Number(i)||ee.current.clientWidth,height:(Number(l)||ee.current.clientHeight)-((null==(e=J.current)?void 0:e.clientHeight)||0)-((null==(t=q.current)?void 0:t.clientHeight)||0)}},[l,i,ee,X,K,q,U,te]),ie=(0,u.useCallback)((e,t,r)=>(0,L.Ht)(e,r,{keys:[...t,e=>t.map(t=>e.values[t]).join(" ")],threshold:L.cG.ACRONYM}),[]),{getTableProps:ce,getTableBodyProps:se,prepareRow:ue,headerGroups:de,footerGroups:he,page:pe,pageCount:ge,gotoPage:fe,preGlobalFilteredRows:me,setGlobalFilter:ye,setPageSize:ve,wrapStickyTable:be,setColumnOrder:we,allColumns:Se,state:{pageIndex:ke,pageSize:Ce,globalFilter:xe,sticky:Ee={},sortBy:Ae}}=(0,D.useTable)({columns:t,data:r,initialState:Q,getTableSize:re,globalFilter:ie,sortTypes:ae,autoResetSortBy:!o()(H,B),manualSortBy:!!w,...P},...F),Ne=(0,u.useCallback)(e=>{O&&T?T(e):ye(e)},[O,T,ye]);(0,u.useEffect)(()=>{const e=(null==n?void 0:n.sortBy)||[];if(w&&!o()(Ae,e))if(Array.isArray(Ae)&&Ae.length>0){const[e]=Ae,r=t.find(t=>(null==t?void 0:t.id)===(null==e?void 0:e.id));if(r&&"columnKey"in r){const t={...e,key:r.columnKey};A([t])}}else A([])},[Ae]);const Oe=e=>{w&&f(0,e),(e||0!==U)&&ve(0===e?U:e)},Te="function"==typeof v?v(xe):v,Ye=()=>(0,s.Y)("div",{className:"dt-no-results",children:Te});if(!t||0===t.length)return be?be(Ye):Ye();const Me=t.some(e=>!!e.Footer);let Ie=-1;const $e=e=>{const t=e.target;Ie=Se.findIndex(e=>e.id===t.dataset.columnName),e.dataTransfer.setData("text/plain",`${Ie}`)},Pe=e=>{const t=e.target,r=Se.findIndex(e=>e.id===t.dataset.columnName);if(-1!==r){const e=Se.map(e=>e.id),t=e.splice(Ie,1);e.splice(r,0,t[0]),we(e),null==k||k()}e.preventDefault()},Fe=()=>(0,s.FD)("table",{...ce({className:e}),children:[(0,s.FD)("thead",{children:[C?C():null,de.map(e=>{const{key:t,...r}=e.getHeaderGroupProps();return(0,s.Y)("tr",{...r,children:e.headers.map(e=>e.render("Header",{key:e.id,...e.getSortByToggleProps(),onDragStart:$e,onDrop:Pe}))},t||e.id)})]}),(0,s.Y)("tbody",{...se(),children:pe&&pe.length>0?pe.map(e=>{ue(e);const{key:t,...r}=e.getRowProps();return(0,s.Y)("tr",{...r,role:"row",children:e.cells.map(e=>e.render("Cell",{key:e.column.id}))},t||e.id)}):(0,s.Y)("tr",{children:(0,s.Y)("td",{className:"dt-no-results",colSpan:t.length,children:Te})})}),Me&&(0,s.Y)("tfoot",{children:he.map(e=>{const{key:t,...r}=e.getHeaderGroupProps();return(0,s.Y)("tr",{...r,role:"row",children:e.headers.map(e=>e.render("Footer",{key:e.id}))},t||e.id)})})]});(_.current[0]!==a||0===a&&_.current[1]!==U)&&(_.current=[a,U],Oe(a));const Re=Ee.height?{}:{visibility:"hidden"};let De=ge,Le=Ce,ze=ke,He=fe;if(w){var Be,je;const e=null!=(Be=null==n?void 0:n.pageSize)?Be:a;De=Math.ceil(m/e),Number.isFinite(De)||(De=0),Le=e,-1===d.findIndex(([e])=>e>=Le)&&(Le=0),ze=null!=(je=null==n?void 0:n.currentPage)?je:0,He=t=>f(t,e)}return(0,s.FD)("div",{ref:ee,style:{width:i,height:l},children:[K?(0,s.Y)("div",{ref:J,className:"form-inline dt-controls",children:(0,s.FD)(z.s,{wrap:!0,className:"row",align:"center",justify:"space-between",gap:"middle",children:[X?(0,s.Y)(W,{total:U,current:Le,options:d,selectRenderer:"boolean"==typeof y?void 0:y,onChange:Oe}):null,(0,s.FD)(z.s,{wrap:!0,align:"center",gap:"middle",children:[w&&(0,s.FD)(E.Space,{size:"small",className:"search-select-container",children:[(0,s.Y)("span",{className:"search-by-label",children:"Search by:"}),(0,s.Y)(le,{searchOptions:$,value:(null==n?void 0:n.searchColumn)||"",onChange:I})]}),g&&(0,s.Y)(j,{searchInput:"boolean"==typeof g?void 0:g,preGlobalFilteredRows:me,setGlobalFilter:O?Ne:ye,filterValue:O?Y:xe,id:M,serverPagination:!!w,rowCount:m}),x?x():null]})]})}):null,be?be(Fe):Fe(),X&&De>1?(0,s.Y)(V,{ref:q,style:Re,maxPageItemCount:h,pageCount:De,currentPage:ze,onPageChange:He}):null]})}),se=y.I4.div`
  ${({theme:e})=>b.AH`
    /* Base table styles */
    table {
      width: 100%;
      min-width: auto;
      max-width: none;
      margin: 0;
      border-collapse: collapse;
    }

    /* Cell styling */
    th,
    td {
      min-width: 4.3em;
      padding: 0.75rem;
      vertical-align: top;
    }

    /* Header styling */
    thead > tr > th {
      padding-right: 0;
      position: relative;
      background-color: ${e.colorBgBase};
      text-align: left;
      border-bottom: 2px solid ${e.colorSplit};
      color: ${e.colorText};
      vertical-align: bottom;
    }

    /* Icons in header */
    th svg {
      margin: 1px ${e.sizeUnit/2}px;
      fill-opacity: 0.2;
    }

    th.is-sorted svg {
      color: ${e.colorText};
      fill-opacity: 1;
    }

    /* Table body styling */
    .table > tbody > tr:first-of-type > td,
    .table > tbody > tr:first-of-type > th {
      border-top: 0;
    }

    .table > tbody tr td {
      font-feature-settings: 'tnum' 1;
      border-top: 1px solid ${e.colorSplit};
    }

    /* Bootstrap-like condensed table styles */
    table.table-condensed,
    table.table-sm {
      font-size: ${e.fontSizeSM}px;
    }

    table.table-condensed th,
    table.table-condensed td,
    table.table-sm th,
    table.table-sm td {
      padding: 0.3rem;
    }

    /* Bootstrap-like bordered table styles */
    table.table-bordered {
      border: 1px solid ${e.colorSplit};
    }

    table.table-bordered th,
    table.table-bordered td {
      border: 1px solid ${e.colorSplit};
    }

    /* Bootstrap-like striped table styles */
    table.table-striped tbody tr:nth-of-type(odd) {
      background-color: ${e.colorBgLayout};
    }

    /* Controls and metrics */
    .dt-controls {
      padding-bottom: 0.65em;
    }

    .dt-metric {
      text-align: right;
    }

    .dt-totals {
      font-weight: ${e.fontWeightStrong};
    }

    .dt-is-null {
      color: ${e.colorTextTertiary};
    }

    td.dt-is-filter {
      cursor: pointer;
    }

    td.dt-is-filter:hover {
      background-color: ${e.colorPrimaryBgHover};
    }

    td.dt-is-active-filter,
    td.dt-is-active-filter:hover {
      background-color: ${e.colorPrimaryBgHover};
    }

    .dt-global-filter {
      float: right;
    }

    /* Cell truncation */
    .dt-truncate-cell {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .dt-truncate-cell:hover {
      overflow: visible;
      white-space: normal;
      height: auto;
    }

    /* Pagination styling */
    .dt-pagination {
      text-align: right;
      /* use padding instead of margin so clientHeight can capture it */
      padding: ${e.paddingXXS}px 0px;
    }

    .dt-pagination .pagination > li {
      display: inline;
      margin: 0 ${e.marginXXS}px;
    }

    .dt-pagination .pagination > li > a,
    .dt-pagination .pagination > li > span {
      background-color: ${e.colorBgBase};
      color: ${e.colorText};
      border-color: ${e.colorBorderSecondary};
      padding: ${e.paddingXXS}px ${e.paddingXS}px;
      border-radius: ${e.borderRadius}px;
    }

    .dt-pagination .pagination > li.active > a,
    .dt-pagination .pagination > li.active > span,
    .dt-pagination .pagination > li.active > a:focus,
    .dt-pagination .pagination > li.active > a:hover,
    .dt-pagination .pagination > li.active > span:focus,
    .dt-pagination .pagination > li.active > span:hover {
      background-color: ${e.colorPrimary};
      color: ${e.colorBgContainer};
      border-color: ${e.colorBorderSecondary};
    }

    .pagination > li > span.dt-pagination-ellipsis:focus,
    .pagination > li > span.dt-pagination-ellipsis:hover {
      background: ${e.colorBgLayout};
      border-color: ${e.colorBorderSecondary};
    }

    .dt-no-results {
      text-align: center;
      padding: 1em 0.6em;
    }

    .right-border-only {
      border-right: 2px solid ${e.colorSplit};
    }

    table .right-border-only:last-child {
      border-right: none;
    }
  `}
`;var ue=r(7566),de=r(40984),he=r(29898),pe=r(42879);function ge(e,t){const{dataType:r,formatter:n,config:o={}}=e,i=r===x.GenericDataType.Numeric,l=void 0===o.d3SmallNumberFormat?n:o.currencyFormat?new de.A({d3Format:o.d3SmallNumberFormat,currency:o.currencyFormat}):(0,he.gV)(o.d3SmallNumberFormat);return function(e,t){return void 0===t?[!1,""]:null===t||t instanceof pe.A&&null===t.input?[!1,"N/A"]:e?[!1,e(t)]:"string"==typeof t?(0,ue.fE)(t)?[!0,(0,ue.pn)(t)]:[!1,t]:[!1,t.toString()]}(i&&"number"==typeof t&&Math.abs(t)<1?l:n,t)}var fe=r(25766);const me={enter:"Enter",spacebar:"Spacebar",space:" "};function ye(e){return e===x.GenericDataType.Temporal?"datetime":e===x.GenericDataType.String?"alphanumeric":"basic"}function ve({column:e}){const{isSorted:t,isSortedDesc:r}=e;let n=(0,s.Y)(h.M,{});return t&&(n=r?(0,s.Y)(p.G,{}):(0,s.Y)(g.X,{})),n}const be=y.I4.label`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;function we({count:e,value:t,onChange:r,onBlur:n,inputRef:o}){return(0,s.FD)(E.Space,{direction:"horizontal",size:4,className:"dt-global-filter",children:[(0,v.t)("Search"),(0,s.Y)(E.Input,{"aria-label":(0,v.t)("Search %s records",e),placeholder:(0,v.tn)("%s record","%s records...",e,e),value:t,onChange:r,onBlur:n,ref:o})]})}function Se({options:e,current:t,onChange:r}){const{Option:n}=E.Select;return(0,s.FD)("span",{className:"dt-select-page-size",children:[(0,s.Y)(be,{htmlFor:"pageSizeSelect",children:(0,v.t)("Select page size")}),(0,v.t)("Show")," ",(0,s.Y)(E.Select,{id:"pageSizeSelect",value:t,onChange:e=>r(e),size:"small",css:e=>b.AH`
          width: ${18*e.sizeUnit}px;
        `,"aria-label":(0,v.t)("Show entries per page"),children:e.map(e=>{const[t,r]=Array.isArray(e)?e:[e,e];return(0,s.Y)(n,{value:Number(t),children:r},t)})})," ",(0,v.t)("entries per page")]})}const ke=e=>e?(0,v.t)("No matching records found"):(0,v.t)("No records found");function Ce(e){const{timeGrain:t,height:r,width:n,data:i,totals:a,isRawRecords:h,rowCount:p=0,columns:g,alignPositiveNegative:f=!1,colorPositiveNegative:x=!1,includeSearch:E=!1,pageSize:F=0,serverPagination:R=!1,serverPaginationData:D,setDataMask:L,showCellBars:z=!0,sortDesc:H=!1,filters:B,sticky:j=!0,columnColorFormatters:U,allowRearrangeColumns:G=!1,allowRenderHtml:_=!0,onContextMenu:W,emitCrossFilters:V,isUsingTimeComparison:X,basicColorFormatters:K,basicColorColumnFormatters:Z,hasServerPageLengthChanged:J,serverPageLength:q,slice_id:ee}=e,te=(0,u.useMemo)(()=>[{key:"all",label:(0,v.t)("Display all")},{key:"#",label:"#"},{key:"△",label:"△"},{key:"%",label:"%"}],[]),re=(0,u.useCallback)(e=>(0,w.PT)(t)(e),[t]),[ne,ie]=(0,u.useState)({width:0,height:0}),[le,ae]=(0,u.useState)(!1),[ue,de]=(0,u.useState)(!1),[he,be]=(0,u.useState)([te[0].key]),[Ce,xe]=(0,u.useState)([]),Ee=(0,y.DP)(),Ae=(0,u.useMemo)(()=>(R?oe.D:oe.x).filter(([e])=>R?(e=>e<=p)(e):e<=2*i.length),[i.length,p,R]),Ne=(0,u.useCallback)(function(e,t){const r=null==i?void 0:i.map(t=>null==t?void 0:t[e]).filter(e=>"number"==typeof e);return i&&r.length===i.length?t?[0,d(r.map(Math.abs))]:function(e){let t,r;for(const n of e)null!=n&&(void 0===t?n>=n&&(t=r=n):(t>n&&(t=n),r<n&&(r=n)));return[t,r]}(r):null},[i]),Oe=(0,u.useCallback)(function(e,t){var r;return!!B&&(null==(r=B[e])?void 0:r.includes(t))},[B]),Te=(0,u.useCallback)((e,r)=>{let n={...B||{}};n=B&&Oe(e,r)?{}:{[e]:[r]},Array.isArray(n[e])&&0===n[e].length&&delete n[e];const o=Object.keys(n),i=Object.values(n),l=[];return o.forEach(e=>{var t;const r=e===S.Tf,o=(0,k.A)(null==(t=n)?void 0:t[e]);if(o.length){const e=o.map(e=>r?re(e):e);l.push(`${e.join(", ")}`)}}),{dataMask:{extraFormData:{filters:0===o.length?[]:o.map(e=>{var r;const o=(0,k.A)(null==(r=n)?void 0:r[e]);return o.length?{col:e,op:"IN",val:o.map(e=>e instanceof Date?e.getTime():e),grain:e===S.Tf?t:void 0}:{col:e,op:"IS NULL"}})},filterState:{label:l.join(", "),value:i.length?i:null,filters:n&&Object.keys(n).length?n:null}},isCurrentValueSelected:Oe(e,r)}},[B,Oe,re,t]),Ye=(0,u.useCallback)(function(e,t){V&&L(Te(e,t).dataMask)},[V,Te,L]),Me=(0,u.useCallback)(e=>{const{isNumeric:t,config:r={}}=e;return{textAlign:r.horizontalAlign||(t&&!X?"right":"left")}},[X]),Ie=(0,u.useMemo)(()=>[(0,v.t)("Main"),"#","△","%"],[]),$e=(0,u.useMemo)(()=>{if(!X)return g;const e=te[0].key,t=Ie[0],r=he.includes(e);return g.filter(({label:e,key:n})=>{const o=n.substring(e.length),i=Ce.includes(o);return e===t||!i&&(!Ie.includes(e)||r||he.includes(e))})},[g,te,Ie,X,Ce,he]),Pe=(0,u.useMemo)(()=>{if(W&&!h)return(e,t,r,n)=>{const o=[];$e.forEach(t=>{if(!t.isMetric){const r=e[t.key];o.push({col:t.key,op:"==",val:r,formattedVal:ge(t,r)[1]})}}),W(r,n,{drillToDetail:o,crossFilter:t.isMetric?void 0:Te(t.key,t.value),drillBy:t.isMetric?void 0:{filters:[{col:t.key,op:"==",val:t.value}],groupbyFieldName:"groupby"}})}},[W,h,$e,Te]),Fe=(0,u.useCallback)((e,t)=>{const r={};return t?(e.forEach((e,t)=>{if(Ie.includes(e.label)){const n=e.key.substring(e.label.length);r[n]?r[n].push(t):r[n]=[t]}}),r):r},[Ie]),Re=(0,u.useMemo)(()=>Fe($e,X),[$e,Fe,X]),De=(0,u.useCallback)((e,t)=>{const{key:r,label:n,dataType:o,isMetric:i,isPercentMetric:l,config:c={}}=e,u=c.customColumnName||n;let d=u;["#","△","%",(0,v.t)("Main")].includes(e.label)&&(e.label===(0,v.t)("Main")?d=c.customColumnName||e.originalLabel||"":c.customColumnName?d=!1!==c.displayTypeIcon?`${e.label} ${c.customColumnName}`:c.customColumnName:!1===c.displayTypeIcon&&(d=""));const p=Number.isNaN(Number(c.columnWidth))?c.columnWidth:Number(c.columnWidth),g=Me(e),w=void 0===c.alignPositiveNegative?f:c.alignPositiveNegative,S=void 0===c.colorPositiveNegative?x:c.colorPositiveNegative,{truncateLongCells:k}=c,E=Array.isArray(U)&&U.length>0,A=X&&Array.isArray(K)&&K.length>0,O=!A&&!E&&(void 0===c.showCellBars?z:c.showCellBars)&&(i||h||l)&&Ne(r,w);let T="";if(V&&!i&&(T+=" dt-is-filter"),i||l){if(Ie.includes(u)){const e=r.substring(u.length),n=Re[e]||[];t===n[n.length-1]&&(T+=" right-border-only")}}else T+=" right-border-only";return{id:String(t),columnKey:r,accessor:e=>e[r],Cell:({value:t,row:n})=>{var o;const[l,a]=ge(e,t),c=l&&_?{__html:a}:void 0;let u,d="";const h=e.key.substring(e.label.length).trim();var f,v,x,N;!E&&A&&(u=null==(f=K[n.index][h])?void 0:f.backgroundColor,d=e.label===Ie[0]?null==(v=K[n.index][h])?void 0:v.mainArrow:""),E&&U.filter(t=>t.column===e.key).forEach(e=>{const r=!(!t&&0!==t)&&e.getColorFromValue(t);r&&(u=r)}),Z&&(null==Z?void 0:Z.length)>0&&(u=(null==(x=Z[n.index][e.key])?void 0:x.backgroundColor)||u,d=e.label===Ie[0]?null==(N=Z[n.index][e.key])?void 0:N.mainArrow:"");const Y=y.I4.td`
            color: ${Ee.colorText};
            text-align: ${g.textAlign};
            white-space: ${t instanceof Date?"nowrap":void 0};
            position: relative;
            background: ${u||void 0};
            padding-left: ${e.isChildColumn?5*Ee.sizeUnit+"px":`${Ee.sizeUnit}px`};
          `,M=b.AH`
            position: absolute;
            height: 100%;
            display: block;
            top: 0;
            ${O&&`\n                width: ${function({value:e,valueRange:t,alignPositiveNegative:r}){const[n,o]=t;if(r)return Math.abs(Math.round(e/o*100));const i=Math.abs(Math.max(o,0))+Math.abs(Math.min(n,0));return Math.round(Math.abs(e)/i*100)}({value:t,valueRange:O,alignPositiveNegative:w})}%;\n                left: ${function({value:e,valueRange:t,alignPositiveNegative:r}){if(r)return 0;const[n,o]=t,i=Math.abs(Math.max(o,0)),l=Math.abs(Math.min(n,0)),a=i+l;return Math.round(Math.min(l+e,l)/a*100)}({value:t,valueRange:O,alignPositiveNegative:w})}%;\n                background-color: ${function({value:e,colorPositiveNegative:t=!1,theme:r}){return t?e<0?`${r.colorError}50`:`${r.colorSuccess}50`:`${r.colorFillSecondary}50`}({value:t,colorPositiveNegative:S,theme:Ee})};\n              `}
          `;let I=b.AH`
            color: ${K&&(null==(o=K[n.index][h])?void 0:o.arrowColor)===P.m.Green?Ee.colorSuccess:Ee.colorError};
            margin-right: ${Ee.sizeUnit}px;
          `;var $;Z&&(null==Z?void 0:Z.length)>0&&(I=b.AH`
              color: ${(null==($=Z[n.index][e.key])?void 0:$.arrowColor)===P.m.Green?Ee.colorSuccess:Ee.colorError};
              margin-right: ${Ee.sizeUnit}px;
            `);const F={"aria-labelledby":`header-${e.key}`,role:"cell",title:"number"==typeof t?String(t):void 0,onClick:!V||O||i?void 0:()=>{(0,C.j)()||Ye(r,t)},onContextMenu:e=>{Pe&&(e.preventDefault(),e.stopPropagation(),Pe(n.original,{key:r,value:t,isMetric:i},e.nativeEvent.clientX,e.nativeEvent.clientY))},className:[T,null==t||t instanceof pe.A&&null==t.input?"dt-is-null":"",Oe(r,t)?" dt-is-active-filter":""].join(" "),tabIndex:0};return c?k?(0,s.Y)(Y,{...F,children:(0,s.Y)("div",{className:"dt-truncate-cell",style:p?{width:p}:void 0,dangerouslySetInnerHTML:c})}):(0,s.Y)(Y,{...F,dangerouslySetInnerHTML:c}):(0,s.FD)(Y,{...F,children:[O&&(0,s.Y)("div",{className:m()("cell-bar","number"==typeof t&&t<0?"negative":"positive"),css:M,role:"presentation"}),k?(0,s.FD)("div",{className:"dt-truncate-cell",style:p?{width:p}:void 0,children:[d&&(0,s.Y)("span",{css:I,children:d}),a]}):(0,s.FD)(s.FK,{children:[d&&(0,s.Y)("span",{css:I,children:d}),a]})]})},Header:({column:t,onClick:r,style:n,onDragStart:o,onDrop:i})=>(0,s.FD)("th",{id:`header-${e.originalLabel}`,title:(0,v.t)("Shift + Click to sort by multiple columns"),className:[T,t.isSorted?"is-sorted":""].join(" "),style:{...g,...n},onKeyDown:e=>{Object.values(me).includes(e.key)&&t.toggleSortBy()},role:"columnheader button",onClick:r,"data-column-name":t.id,...G&&{draggable:"true",onDragStart:o,onDragOver:e=>e.preventDefault(),onDragEnter:e=>e.preventDefault(),onDrop:i},tabIndex:0,children:[c.columnWidth?(0,s.Y)("div",{style:{width:p,height:.01}}):null,(0,s.FD)("div",{"data-column-name":t.id,css:{display:"inline-flex",alignItems:"flex-end"},children:[(0,s.Y)("span",{"data-column-name":t.id,children:d}),(0,s.Y)(ve,{column:t})]})]}),Footer:a?0===t?(0,s.Y)("th",{children:(0,s.FD)("div",{css:b.AH`
                  display: flex;
                  align-items: center;
                  & svg {
                    margin-left: ${Ee.sizeUnit}px;
                    color: ${Ee.colorBorder} !important;
                  }
                `,children:[(0,v.t)("Summary"),(0,s.Y)(N.m,{overlay:(0,v.t)("Show total aggregations of selected metrics. Note that row limit does not apply to the result."),children:(0,s.Y)($.A,{})})]})},`footer-summary-${t}`):(0,s.Y)("td",{style:g,children:(0,s.Y)("strong",{children:ge(e,a[r])[1]})},`footer-total-${t}`):void 0,sortDescFirst:H,sortType:ye(o)}},[Me,f,x,U,X,K,z,h,Ne,V,Ie,a,Ee,H,Re,_,Z,Oe,Ye,Pe,G]),Le=(0,u.useMemo)(()=>$e.filter(e=>{var t;return!1!==(null==(t=e.config)?void 0:t.visible)}),[$e]),ze=(0,u.useMemo)(()=>Le.map(De),[Le,De]),[He,Be]=(0,u.useState)([]);(0,u.useEffect)(()=>{const e=ze.filter(e=>"alphanumeric"===(null==e?void 0:e.sortType)).map(e=>({value:e.columnKey,label:e.columnKey}));o()(e,He)||Be(e||[])},[ze,He]);const je=(0,u.useCallback)((e,t)=>{const r={...D,currentPage:e,pageSize:t};(0,fe.F)(L,r)},[D,L]);(0,u.useEffect)(()=>{if(J){const e={...D,currentPage:0,pageSize:q};(0,fe.F)(L,e)}},[J,q,D,L]);const Ue=(0,u.useCallback)(({width:e,height:t})=>{ie({width:e,height:t})},[]);(0,u.useLayoutEffect)(()=>{const e=Q(),{width:t,height:o}=ne;n-t>e||r-o>e?Ue({width:n-e,height:r-e}):(t-n>e||o-r>e)&&Ue({width:n,height:r})},[n,r,Ue,ne]);const{width:Ge,height:_e}=ne,We=(0,u.useCallback)(e=>{if(!R)return;const t={...D,sortBy:e};(0,fe.F)(L,t)},[R,D,L]),Ve=l()(e=>{var t;const r={...D||{},searchColumn:(null==D?void 0:D.searchColumn)||(null==(t=He[0])?void 0:t.value),searchText:e,currentPage:0};(0,fe.F)(L,r)},800);return(0,s.Y)(se,{children:(0,s.Y)(ce,{columns:ze,data:i,rowCount:p,tableClassName:"table table-striped table-condensed",pageSize:F,serverPaginationData:D,pageSizeOptions:Ae,width:Ge,height:_e,serverPagination:R,onServerPaginationChange:je,onColumnOrderChange:()=>ae(!le),initialSearchText:(null==D?void 0:D.searchText)||"",sortByFromParent:(null==D?void 0:D.sortBy)||[],searchInputId:`${ee}-search`,maxPageItemCount:n>340?9:7,noResults:ke,searchInput:E&&we,selectPageSize:null!==F&&Se,sticky:j,renderGroupingHeaders:c()(Re)?void 0:()=>{const e=[];let t=0;return Object.entries(Re||{}).forEach(([r,n])=>{var o;const i=n[0],l=n.length,a=$e[i],c=a&&(null==(o=g.find(e=>e.key===a.key))?void 0:o.originalLabel)||r;for(let r=t;r<i;r+=1)e.push((0,s.Y)("th",{style:{borderBottom:0},"aria-label":`Header-${r}`},`placeholder-${r}`));e.push((0,s.FD)("th",{colSpan:l,style:{borderBottom:0},children:[c,(0,s.Y)("span",{css:b.AH`
              float: right;
              & svg {
                color: ${Ee.colorIcon} !important;
              }
            `,children:Ce.includes(r)?(0,s.Y)(M.A,{onClick:()=>xe(Ce.filter(e=>e!==r))}):(0,s.Y)(I.A,{onClick:()=>xe([...Ce,r])})})]},`header-${r}`)),t=i+l}),(0,s.Y)("tr",{css:b.AH`
          th {
            border-right: 1px solid ${Ee.colorSplit};
          }
          th:first-child {
            border-left: none;
          }
          th:last-child {
            border-right: none;
          }
        `,children:e})},renderTimeComparisonDropdown:X?()=>{const e=te[0].key;return(0,s.Y)(A.ms,{placement:"bottomRight",open:ue,onOpenChange:e=>{de(e)},menu:{multiple:!0,onClick:t=>{const{key:r}=t;r===e?be([e]):he.includes(e)?be([r]):be(he.includes(r)?he.filter(e=>e!==r):[...he,r])},onBlur:()=>{3===he.length&&be([te[0].key])},selectedKeys:he,items:[{key:"all",label:(0,s.Y)("div",{css:b.AH`
                    max-width: 242px;
                    padding: 0 ${2*Ee.sizeUnit}px;
                    color: ${Ee.colorText};
                    font-size: ${Ee.fontSizeSM}px;
                  `,children:(0,v.t)("Select columns that will be displayed in the table. You can multiselect columns.")}),type:"group",children:te.map(e=>({key:e.key,label:(0,s.FD)(s.FK,{children:[(0,s.Y)("span",{css:b.AH`
                          color: ${Ee.colorText};
                        `,children:e.label}),(0,s.Y)("span",{css:b.AH`
                          float: right;
                          font-size: ${Ee.fontSizeSM}px;
                        `,children:he.includes(e.key)&&(0,s.Y)(O.A,{})})]})}))}]},trigger:["click"],children:(0,s.FD)("span",{children:[(0,s.Y)(T.A,{})," ",(0,s.Y)(Y.A,{})]})})}:void 0,handleSortByChange:We,onSearchColChange:e=>{if(!o()(e,null==D?void 0:D.searchColumn)){const t={...D||{},searchColumn:e,searchText:""};(0,fe.F)(L,t)}},manualSearch:R,onSearchChange:Ve,searchOptions:He})})}},95021:(e,t,r)=>{"use strict";r.d(t,{j:()=>n});const n=()=>{var e;return null==(e=window.getSelection())?void 0:e.toString()}}}]);