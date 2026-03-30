"use strict";(globalThis.webpackChunksuperset=globalThis.webpackChunksuperset||[]).push([[5191],{6694:(e,t,n)=>{n.d(t,{Ay:()=>a.A});var a=n(66492);n(61972)},13817:(e,t,n)=>{n.d(t,{A:()=>d,v:()=>o});var a=n(2445),l=n(24002),i=n.n(l),r=n(23576);const o=()=>{var e;return null==(e=document.getElementById("controlSections"))?void 0:e.lastElementChild},c=e=>{var t,n;const a=null==(t=window)?void 0:t.innerHeight,l=null==(n=window)?void 0:n.innerWidth,i=null==e?void 0:e.getBoundingClientRect();return a&&l&&null!=i&&i.top?{yRatio:i.top/a,xRatio:i.left/l}:{yRatio:0,xRatio:0}},d=({getPopupContainer:e,getVisibilityRatio:t=c,open:n,destroyTooltipOnHide:d=!1,placement:s="right",...u})=>{const h=(0,l.useRef)(),[p,m]=(0,l.useState)(void 0===n?u.defaultOpen:n),[v,g]=i().useState(s),f=(0,l.useCallback)(()=>{if(!h.current)return;const{yRatio:e,xRatio:n}=t(h.current),a=n<.35?"right":n>.65?"left":"",l=e<.35?a?"top":"bottom":e>.65?a?"bottom":"top":"",i=(a?a+l.charAt(0).toUpperCase()+l.slice(1):l)||"left";i!==v&&g(i)},[t]),C=(0,l.useCallback)(e=>{const t=o();t&&t.style.setProperty("overflow-y",e?"hidden":"auto","important")},[f]),Y=(0,l.useCallback)(t=>(h.current=t,(null==e?void 0:e(t))||document.body),[f,e]),b=(0,l.useCallback)(e=>{void 0===e&&C(e),m(!!e),null==u.onOpenChange||u.onOpenChange(!!e)},[u,C]),y=(0,l.useCallback)(e=>{"Escape"===e.key&&(m(!1),null==u.onOpenChange||u.onOpenChange(!1))},[u]);return(0,l.useEffect)(()=>{void 0!==n&&m(!!n)},[n]),(0,l.useEffect)(()=>{void 0!==p&&C(p)},[p,C]),(0,l.useEffect)(()=>(p&&document.addEventListener("keydown",y),()=>{document.removeEventListener("keydown",y)}),[y,p]),(0,l.useEffect)(()=>{p&&f()},[p,f]),(0,a.Y)(r.A,{...u,open:p,arrow:{pointAtCenter:!0},placement:v,onOpenChange:b,getPopupContainer:Y,destroyTooltipOnHide:d})}},17102:(e,t,n)=>{n.d(t,{Mo:()=>o,YH:()=>i,j3:()=>r});var a=n(81465),l=n(82384);const i=0,r=a.I4.div`
  min-height: ${({height:e})=>e}px;
  width: ${({width:e})=>e===i?"100%":`${e}px`};
`,o=((0,a.I4)(l.e)`
  &.ant-row.ant-form-item {
    margin: 0;
  }
`,a.I4.div`
  color: ${({theme:e,status:t="error"})=>{if("help"===t)return e.colorTextSecondary;switch(t){case"error":default:return e.colorError;case"warning":return e.colorWarning;case"info":return e.colorInfo}}};
  text-align: ${({centerText:e})=>e?"center":"left"};
  width: 100%;
`)},18865:(e,t,n)=>{n.d(t,{A:()=>h});var a=n(2445),l=n(74098),i=n(17437),r=n(81465),o=n(23195),c=n(95018),d=n(5250),s=n(8558);const u=i.AH`
  &.anticon {
    font-size: unset;
    .anticon {
      line-height: unset;
      vertical-align: unset;
    }
  }
`,h=({name:e,label:t,description:n,validationErrors:h=[],renderTrigger:p=!1,rightNode:m,leftNode:v,onClick:g,hovered:f=!1,tooltipOnClick:C=()=>{},warning:Y,danger:b})=>{const y=(0,r.DP)();return t?(0,a.FD)("div",{className:"ControlHeader",children:[(0,a.Y)("div",{className:"pull-left",children:(0,a.FD)(o.l,{css:e=>i.AH`
            margin-bottom: ${.5*e.sizeUnit}px;
            position: relative;
            font-size: ${e.fontSizeSM}px;
          `,children:[v&&(0,a.FD)("span",{children:[v," "]}),(0,a.Y)("span",{role:"button",tabIndex:0,onClick:g,style:{cursor:g?"pointer":""},children:t})," ",Y&&(0,a.FD)("span",{children:[(0,a.Y)(c.m,{id:"error-tooltip",placement:"top",title:Y,children:(0,a.Y)(s.F.WarningOutlined,{iconColor:y.colorWarning,css:i.AH`
                    vertical-align: baseline;
                  `,iconSize:"s"})})," "]}),b&&(0,a.FD)("span",{children:[(0,a.Y)(c.m,{id:"error-tooltip",placement:"top",title:b,children:(0,a.Y)(s.F.CloseCircleOutlined,{iconColor:y.colorErrorText,iconSize:"s"})})," "]}),(null==h?void 0:h.length)>0&&(0,a.FD)("span",{css:i.AH`
                cursor: pointer;
              `,children:[(0,a.Y)(c.m,{id:"error-tooltip",placement:"top",title:null==h?void 0:h.join(" "),children:(0,a.Y)(s.F.InfoCircleOutlined,{iconColor:y.colorErrorText})})," "]}),f?(0,a.FD)("span",{css:()=>i.AH`
          position: absolute;
          top: 50%;
          right: 0;
          padding-left: ${y.sizeUnit}px;
          transform: translate(100%, -50%);
          white-space: nowrap;
        `,children:[n&&(0,a.FD)("span",{children:[(0,a.Y)(c.m,{id:"description-tooltip",title:n,placement:"top",children:(0,a.Y)(s.F.InfoCircleOutlined,{css:u,onClick:C})})," "]}),p&&(0,a.FD)("span",{children:[(0,a.Y)(d.I,{label:(0,l.t)("bolt"),tooltip:(0,l.t)("Changing this control takes effect instantly"),placement:"top",type:"notice"})," "]})]}):null]})}),m&&(0,a.Y)("div",{className:"pull-right",children:m}),(0,a.Y)("div",{className:"clearfix"})]}):null}},36188:(e,t,n)=>{n.d(t,{c:()=>r});var a=n(2445),l=n(17437),i=n(29645);function r(e){return(0,a.Y)(i.Divider,{css:e=>l.AH`
        margin: ${e.margin}px 0;
      `,...e})}},49231:(e,t,n)=>{n.d(t,{RV:()=>s,be:()=>r,cJ:()=>d,ke:()=>c,kw:()=>u,o6:()=>i,oF:()=>l,sw:()=>a,u_:()=>o});const a="previous calendar week",l="previous calendar month",i="previous calendar quarter",r="previous calendar year",o="Current day",c="Current week",d="Current month",s="Current year",u="Current quarter"},61972:(e,t,n)=>{n.d(t,{cn:()=>d,oo:()=>Y,nS:()=>s,z6:()=>o,Be:()=>C,OL:()=>c,yI:()=>b,ZC:()=>u,Ex:()=>h,c1:()=>y,BJ:()=>r,bd:()=>w,IZ:()=>m,Wm:()=>g,s6:()=>v,OP:()=>f,IS:()=>E,Ab:()=>$,J5:()=>I,IM:()=>O});var a=n(59674),l=n(74098),i=n(49231);const r=[{value:"Common",label:(0,l.t)("Last")},{value:"Calendar",label:(0,l.t)("Previous")},{value:"Current",label:(0,l.t)("Current")},{value:"Custom",label:(0,l.t)("Custom")},{value:"Advanced",label:(0,l.t)("Advanced")},{value:"No filter",label:(0,l.t)("No filter")}],o=[{value:"Last day",label:(0,l.t)("Last day")},{value:"Last week",label:(0,l.t)("Last week")},{value:"Last month",label:(0,l.t)("Last month")},{value:"Last quarter",label:(0,l.t)("Last quarter")},{value:"Last year",label:(0,l.t)("Last year")}],c=new Set(o.map(e=>e.value)),d=[{value:i.sw,label:(0,l.t)("previous calendar week")},{value:i.oF,label:(0,l.t)("previous calendar month")},{value:i.o6,label:(0,l.t)("previous calendar quarter")},{value:i.be,label:(0,l.t)("previous calendar year")}],s=new Set(d.map(e=>e.value)),u=[{value:i.u_,label:(0,l.t)("Current day")},{value:i.ke,label:(0,l.t)("Current week")},{value:i.cJ,label:(0,l.t)("Current month")},{value:i.kw,label:(0,l.t)("Current quarter")},{value:i.RV,label:(0,l.t)("Current year")}],h=new Set(u.map(e=>e.value)),p=[{value:"second",label:e=>(0,l.t)("Seconds %s",e)},{value:"minute",label:e=>(0,l.t)("Minutes %s",e)},{value:"hour",label:e=>(0,l.t)("Hours %s",e)},{value:"day",label:e=>(0,l.t)("Days %s",e)},{value:"week",label:e=>(0,l.t)("Weeks %s",e)},{value:"month",label:e=>(0,l.t)("Months %s",e)},{value:"quarter",label:e=>(0,l.t)("Quarters %s",e)},{value:"year",label:e=>(0,l.t)("Years %s",e)}],m=p.map(e=>({value:e.value,label:e.label((0,l.t)("Before"))})),v=p.map(e=>({value:e.value,label:e.label((0,l.t)("After"))})),g=[{value:"specific",label:(0,l.t)("Specific Date/Time")},{value:"relative",label:(0,l.t)("Relative Date/Time")},{value:"now",label:(0,l.t)("Now")},{value:"today",label:(0,l.t)("Midnight")}],f=g.slice(),C=new Set(["Last day","Last week","Last month","Last quarter","Last year"]),Y=new Set([i.sw,i.oF,i.o6,i.be]),b=new Set([i.u_,i.ke,i.cJ,i.kw,i.RV]),y="YYYY-MM-DD[T]HH:mm:ss",w=((0,a.XV)().utc().startOf("day").subtract(7,"days").format(y),(0,a.XV)().utc().startOf("day").format(y));var x;!function(e){e.CommonFrame="common-frame",e.ModalOverlay="modal-overlay",e.PopoverOverlay="time-range-trigger",e.NoFilter="no-filter",e.CancelButton="cancel-button",e.ApplyButton="date-filter-control__apply-button"}(x||(x={}));const D=String.raw`\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:(?:[+-]\d\d:\d\d)|Z)?`,F=String.raw`(?:TODAY|NOW)`,A=(RegExp(String.raw`^${D}$|^${F}$`,"i"),["specific","today","now"]),$=e=>"now"===e?(0,a.XV)().utc().startOf("second"):"today"===e?(0,a.XV)().utc().startOf("day"):(0,a.XV)(e),S=e=>$(e).format(y),E=e=>{const{sinceDatetime:t,sinceMode:n,sinceGrain:a,sinceGrainValue:l,untilDatetime:i,untilMode:r,untilGrain:o,untilGrainValue:c,anchorValue:d}={...e};if(A.includes(n)&&A.includes(r))return`${"specific"===n?S(t):n} : ${"specific"===r?S(i):r}`;if(A.includes(n)&&"relative"===r){const e="specific"===n?S(t):n;return`${e} : DATEADD(DATETIME("${e}"), ${c}, ${o})`}if("relative"===n&&A.includes(r)){const e="specific"===r?S(i):r;return`DATEADD(DATETIME("${e}"), ${-Math.abs(l)}, ${a}) : ${e}`}return`DATEADD(DATETIME("${d}"), ${-Math.abs(l)}, ${a}) : DATEADD(DATETIME("${d}"), ${c}, ${o})`};var N=n(31463),T=n(39242),k=n(61225);const I=e=>c.has(e)?"Common":s.has(e)?"Calendar":h.has(e)?"Current":e===N.WC?"No filter":(0,T.t)(e).matchedFlag?"Custom":"Advanced";function O(){var e;return null!=(e=(0,k.d4)(e=>{var t;return null==e||null==(t=e.common)||null==(t=t.conf)?void 0:t.DEFAULT_TIME_FILTER}))?e:N.WC}},66492:(e,t,n)=>{n.d(t,{A:()=>q});var a=n(2445),l=n(24002),i=n(81465),r=n(17437),o=n(39591),c=n(31463),d=n(20033),s=n(74098),u=n(2801),h=n(23575),p=n(36188),m=n(88217),v=n(95018),g=n(18865),f=n(8558),C=n(28674),Y=n(93590),b=n(13817),y=n(61972),w=n(22750);function x(e){let t="Last week";return y.Be.has(e.value)?t=e.value:e.onChange(t),(0,a.FD)(a.FK,{children:[(0,a.Y)("div",{className:"section-title",children:(0,s.t)("Configure Time Range: Last...")}),(0,a.Y)(w.s.GroupWrapper,{spaceConfig:{direction:"vertical",size:15,align:"start",wrap:!1},size:"large",value:t,onChange:t=>e.onChange(t.target.value),options:y.z6})]})}var D=n(49231);function F({onChange:e,value:t}){return(0,l.useEffect)(()=>{y.oo.has(t)||e(D.sw)},[e,t]),y.oo.has(t)?(0,a.FD)(a.FK,{children:[(0,a.Y)("div",{className:"section-title",children:(0,s.t)("Configure Time Range: Previous...")}),(0,a.Y)(w.s.GroupWrapper,{spaceConfig:{direction:"vertical",size:15,align:"start",wrap:!1},size:"large",value:t,onChange:t=>e(t.target.value),options:y.cn})]}):null}function A({onChange:e,value:t}){return(0,l.useEffect)(()=>{y.yI.has(t)||e(D.ke)},[t]),y.yI.has(t)?(0,a.FD)(a.FK,{children:[(0,a.Y)("div",{className:"section-title",children:(0,s.t)("Configure Time Range: Current...")}),(0,a.Y)(w.s.GroupWrapper,{spaceConfig:{direction:"vertical",size:15,align:"start",wrap:!0},size:"large",onChange:t=>{let n=t.target.value;n=n.trim(),""!==n&&e(n)},options:y.ZC})]}):null}var $=n(39242),S=n(56196),E=n(20668),N=n(29645),T=n(5250),k=n(64535),I=n(89064);function O(e){const{customRange:t,matchedFlag:n}=(0,$.t)(e.value),l=(0,I.Y)();n||e.onChange((0,y.IS)(t));const{sinceDatetime:i,sinceMode:r,sinceGrain:o,sinceGrainValue:c,untilDatetime:d,untilMode:h,untilGrain:p,untilGrainValue:m,anchorValue:v,anchorMode:g}={...t};function f(n,a){e.onChange((0,y.IS)({...t,[n]:a}))}function C(n,a){"number"==typeof a&&Number.isInteger(a)&&a>0&&e.onChange((0,y.IS)({...t,[n]:a}))}return null===l?(0,a.Y)(S.R,{position:"inline-centered"}):(0,a.Y)(E.Q,{locale:l,children:(0,a.FD)("div",{children:[(0,a.Y)("div",{className:"section-title",children:(0,s.t)("Configure custom time range")}),(0,a.FD)(N.Row,{gutter:24,children:[(0,a.FD)(N.Col,{span:12,children:[(0,a.FD)("div",{className:"control-label",children:[(0,s.t)("Start (inclusive)")," ",(0,a.Y)(T.I,{tooltip:(0,s.t)("Start date included in time range"),placement:"right"})]}),(0,a.Y)(u.A,{ariaLabel:(0,s.t)("Start (inclusive)"),options:y.Wm,value:r,onChange:e=>f("sinceMode",e)}),"specific"===r&&(0,a.Y)(N.Row,{children:(0,a.Y)(k.l,{showTime:!0,defaultValue:(0,y.Ab)(i),onChange:e=>f("sinceDatetime",e.format(y.c1)),allowClear:!1,getPopupContainer:t=>e.isOverflowingFilterBar?t.parentNode:document.body})}),"relative"===r&&(0,a.FD)(N.Row,{gutter:8,children:[(0,a.Y)(N.Col,{span:11,children:(0,a.Y)(N.InputNumber,{placeholder:(0,s.t)("Relative quantity"),value:Math.abs(c),min:1,defaultValue:1,onChange:e=>C("sinceGrainValue",e||1),onStep:e=>C("sinceGrainValue",e||1)})}),(0,a.Y)(N.Col,{span:13,children:(0,a.Y)(u.A,{ariaLabel:(0,s.t)("Relative period"),options:y.IZ,value:o,onChange:e=>f("sinceGrain",e)})})]})]}),(0,a.FD)(N.Col,{span:12,children:[(0,a.FD)("div",{className:"control-label",children:[(0,s.t)("End (exclusive)")," ",(0,a.Y)(T.I,{tooltip:(0,s.t)("End date excluded from time range"),placement:"right"})]}),(0,a.Y)(u.A,{ariaLabel:(0,s.t)("End (exclusive)"),options:y.OP,value:h,onChange:e=>f("untilMode",e)}),"specific"===h&&(0,a.Y)(N.Row,{children:(0,a.Y)(k.l,{showTime:!0,defaultValue:(0,y.Ab)(d),onChange:e=>f("untilDatetime",e.format(y.c1)),allowClear:!1,getPopupContainer:t=>e.isOverflowingFilterBar?t.parentNode:document.body})}),"relative"===h&&(0,a.FD)(N.Row,{gutter:8,children:[(0,a.Y)(N.Col,{span:11,children:(0,a.Y)(N.InputNumber,{placeholder:(0,s.t)("Relative quantity"),value:m,min:1,defaultValue:1,onChange:e=>C("untilGrainValue",e||1),onStep:e=>C("untilGrainValue",e||1)})}),(0,a.Y)(N.Col,{span:13,children:(0,a.Y)(u.A,{ariaLabel:(0,s.t)("Relative period"),options:y.s6,value:p,onChange:e=>f("untilGrain",e)})})]})]})]}),"relative"===r&&"relative"===h&&(0,a.FD)("div",{className:"control-anchor-to",children:[(0,a.Y)("div",{className:"control-label",children:(0,s.t)("Anchor to")}),(0,a.FD)(N.Row,{align:"middle",children:[(0,a.Y)(N.Col,{children:(0,a.Y)(w.s.GroupWrapper,{options:[{value:"now",label:(0,s.t)("Now")},{value:"specific",label:(0,s.t)("Date/Time")}],onChange:function(n){const a=n.target.value;"now"===a?e.onChange((0,y.IS)({...t,anchorValue:"now",anchorMode:a})):e.onChange((0,y.IS)({...t,anchorValue:y.bd,anchorMode:a}))},defaultValue:"now",value:g})}),"now"!==g&&(0,a.Y)(N.Col,{children:(0,a.Y)(k.l,{showTime:!0,defaultValue:(0,y.Ab)(v),onChange:e=>f("anchorValue",e.format(y.c1)),allowClear:!1,className:"control-anchor-to-datetime",getPopupContainer:t=>e.isOverflowingFilterBar?t.parentNode:document.body})})]})]})]})})}const R=(0,a.FD)(a.FK,{children:[(0,a.FD)("div",{children:[(0,a.Y)("h3",{children:"DATETIME"}),(0,a.Y)("p",{children:(0,s.t)("Return to specific datetime.")}),(0,a.Y)("h4",{children:(0,s.t)("Syntax")}),(0,a.Y)("pre",{children:(0,a.Y)("code",{children:"datetime([string])"})}),(0,a.Y)("h4",{children:(0,s.t)("Example")}),(0,a.Y)("pre",{children:(0,a.Y)("code",{children:'datetime("2020-03-01 12:00:00")\ndatetime("now")\ndatetime("last year")'})})]}),(0,a.FD)("div",{children:[(0,a.Y)("h3",{children:"DATEADD"}),(0,a.Y)("p",{children:(0,s.t)("Moves the given set of dates by a specified interval.")}),(0,a.Y)("h4",{children:(0,s.t)("Syntax")}),(0,a.Y)("pre",{children:(0,a.Y)("code",{children:"dateadd([datetime], [integer], [dateunit])\ndateunit = (year | quarter | month | week | day | hour | minute | second)"})}),(0,a.Y)("h4",{children:(0,s.t)("Example")}),(0,a.Y)("pre",{children:(0,a.Y)("code",{children:'dateadd(datetime("today"), -13, day)\ndateadd(datetime("2020-03-01"), 2, day)'})})]}),(0,a.FD)("div",{children:[(0,a.Y)("h3",{children:"DATETRUNC"}),(0,a.Y)("p",{children:(0,s.t)("Truncates the specified date to the accuracy specified by the date unit.")}),(0,a.Y)("h4",{children:(0,s.t)("Syntax")}),(0,a.Y)("pre",{children:(0,a.Y)("code",{children:"datetrunc([datetime], [dateunit])\ndateunit = (year | quarter | month | week)"})}),(0,a.Y)("h4",{children:(0,s.t)("Example")}),(0,a.Y)("pre",{children:(0,a.Y)("code",{children:'datetrunc(datetime("2020-03-01"), week)\ndatetrunc(datetime("2020-03-01"), month)'})})]}),(0,a.FD)("div",{children:[(0,a.Y)("h3",{children:"LASTDAY"}),(0,a.Y)("p",{children:(0,s.t)("Get the last date by the date unit.")}),(0,a.Y)("h4",{children:(0,s.t)("Syntax")}),(0,a.Y)("pre",{children:(0,a.Y)("code",{children:"lastday([datetime], [dateunit])\ndateunit = (year | month | week)"})}),(0,a.Y)("h4",{children:(0,s.t)("Example")}),(0,a.Y)("pre",{children:(0,a.Y)("code",{children:'lastday(datetime("today"), month)'})})]}),(0,a.FD)("div",{children:[(0,a.Y)("h3",{children:"HOLIDAY"}),(0,a.Y)("p",{children:(0,s.t)("Get the specify date for the holiday")}),(0,a.Y)("h4",{children:(0,s.t)("Syntax")}),(0,a.Y)("pre",{children:(0,a.Y)("code",{children:"holiday([string])\nholiday([holiday string], [datetime])\nholiday([holiday string], [datetime], [country name])"})}),(0,a.Y)("h4",{children:(0,s.t)("Example")}),(0,a.Y)("pre",{children:(0,a.Y)("code",{children:'holiday("new year")\nholiday("christmas", datetime("2019"))\nholiday("christmas", dateadd(datetime("2019"), 1, year))\nholiday("christmas", datetime("2 years ago"))\nholiday("Easter Monday", datetime("2019"), "UK")'})})]})]}),z=e=>{const t=(0,i.DP)();return(0,a.Y)(r.Z2,{children:({css:n})=>(0,a.Y)(v.m,{overlayClassName:n`
            .ant-tooltip-content {
              min-width: ${125*t.sizeUnit}px;
              max-height: 410px;
              overflow-y: scroll;

              .ant-tooltip-inner {
                max-width: ${125*t.sizeUnit}px;
                h3 {
                  font-size: ${t.fontSize}px;
                  font-weight: ${t.fontWeightStrong};
                }
                h4 {
                  font-size: ${t.fontSize}px;
                  font-weight: ${t.fontWeightStrong};
                }
                pre {
                  border: none;
                  text-align: left;
                  word-break: break-word;
                  font-size: ${t.fontSizeSM}px;
                }
              }
            }
          `,...e})})};function L(e){return(0,a.Y)(z,{title:R,...e})}function M(e){return e.includes(d.wv)?e:e.startsWith("Last")?[e,""].join(d.wv):e.startsWith("Next")?["",e].join(d.wv):d.wv}function V(e){const t=M(e.value||""),[n,l]=t.split(d.wv);function i(t,a){"since"===t?e.onChange(`${a}${d.wv}${l}`):e.onChange(`${n}${d.wv}${a}`)}return t!==e.value&&e.onChange(M(e.value||"")),(0,a.FD)(a.FK,{children:[(0,a.FD)("div",{className:"section-title",children:[(0,s.t)("Configure Advanced Time Range "),(0,a.Y)(L,{placement:"rightBottom",children:(0,a.Y)(f.F.InfoCircleOutlined,{})})]}),(0,a.FD)("div",{className:"control-label",children:[(0,s.t)("Start (inclusive)")," ",(0,a.Y)(T.I,{tooltip:(0,s.t)("Start date included in time range"),placement:"right"})]}),(0,a.Y)(N.Input,{value:n,onChange:e=>i("since",e.target.value)},"since"),(0,a.FD)("div",{className:"control-label",children:[(0,s.t)("End (exclusive)")," ",(0,a.Y)(T.I,{tooltip:(0,s.t)("End date excluded from time range"),placement:"right"})]}),(0,a.Y)(N.Input,{value:l,onChange:e=>i("until",e.target.value)},"until")]})}const W=i.I4.div`
  ${({theme:e,isActive:t,isPlaceholder:n})=>r.AH`
    height: ${8*e.sizeUnit}px;

    display: flex;
    align-items: center;
    flex-wrap: nowrap;

    padding: 0 ${3*e.sizeUnit}px;

    background-color: ${e.colorBgContainer};

    border: 1px solid ${t?e.colorPrimary:e.colorBorder};
    border-radius: ${e.borderRadius}px;

    cursor: pointer;

    transition: border-color 0.3s cubic-bezier(0.65, 0.05, 0.36, 1);
    :hover,
    :focus {
      border-color: ${e.colorPrimary};
    }

    .date-label-content {
      color: ${n?e.colorTextPlaceholder:e.colorText};
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
      flex-shrink: 1;
      white-space: nowrap;
    }

    span[role='img'] {
      color: ${n?e.colorTextPlaceholder:e.colorText};
      margin-left: auto;
      padding-left: ${e.sizeUnit}px;

      & > span[role='img'] {
        line-height: 0;
      }
    }
  `}
`,P=(0,l.forwardRef)((e,t)=>(0,a.FD)(W,{...e,tabIndex:0,role:"button",children:[(0,a.Y)("span",{id:`date-label-${e.name}`,className:"date-label-content",ref:t,children:"string"==typeof e.label?(0,s.t)(e.label):e.label}),(0,a.Y)(f.F.CalendarOutlined,{iconSize:"s"})]})),G=(0,i.I4)(u.A)`
  width: 272px;
`,H=i.I4.div`
  ${({theme:e})=>r.AH`
    .ant-row {
      margin-top: 8px;
    }

    .ant-picker {
      padding: 4px 17px 4px;
      border-radius: 4px;
    }

    .ant-divider-horizontal {
      margin: 16px 0;
    }

    .control-label {
      font-size: ${e.fontSizeSM}px;
      line-height: 16px;
      margin: 8px 0;
    }

    .section-title {
      font-style: normal;
      font-weight: ${e.fontWeightStrong};
      font-size: 15px;
      line-height: 24px;
      margin-bottom: 8px;
    }

    .control-anchor-to {
      margin-top: 16px;
    }

    .control-anchor-to-datetime {
      width: 217px;
    }

    .footer {
      text-align: right;
    }
  `}
`,B=i.I4.span`
  span {
    margin-right: ${({theme:e})=>2*e.sizeUnit}px;
    vertical-align: middle;
  }
  .text {
    vertical-align: middle;
  }
  .error {
    color: ${({theme:e})=>e.colorError};
  }
`,U=(e,t,n)=>e?(0,a.FD)("div",{children:[t&&(0,a.Y)("strong",{children:t}),n&&(0,a.Y)("div",{css:e=>r.AH`
            margin-top: ${e.sizeUnit}px;
          `,children:n})]}):n||null;function q(e){var t;const{name:n,onChange:r,onOpenPopover:u=Y.fZ,onClosePopover:w=Y.fZ,isOverflowingFilterBar:D=!1}=e,$=(0,y.IM)(),S=null!=(t=e.value)?t:$,[E,N]=(0,l.useState)(S),[T,k]=(0,l.useState)(!1),I=(0,l.useMemo)(()=>(0,y.J5)(S),[S]),[R,z]=(0,l.useState)(I),[L,M]=(0,l.useState)(S),[W,q]=(0,l.useState)(S),[Z,_]=(0,l.useState)(!1),[J,K]=(0,l.useState)(S),[j,X]=(0,l.useState)(S),Q=(0,i.DP)(),[ee,te]=(0,o.A)();function ne(){q(S),z(I),k(!1),w()}(0,l.useEffect)(()=>{if(S===c.WC)return N(c.WC),X(null),void _(!0);(0,d.x9)(S).then(({value:e,error:t})=>{t?(K(t||""),_(!1),X(S||null)):("Common"===I||"Calendar"===I||"Current"===I||"No filter"===I?(N(S),X(U(te,S,e))):(N(e||""),X(U(te,e,S))),_(!0)),M(S),K(e||S)})},[I,te,ee,S]),(0,C.sv)(()=>{if(W===c.WC)return K(c.WC),M(c.WC),void _(!0);L!==W&&(0,d.x9)(W).then(({value:e,error:t})=>{t?(K(t||""),_(!1)):(K(e||""),_(!0)),M(W)})},h.Y.SLOW_DEBOUNCE,[W]);const ae=(0,a.FD)(H,{children:[(0,a.Y)("div",{className:"control-label",children:(0,s.t)("Range type")}),(0,a.Y)(G,{ariaLabel:(0,s.t)("Range type"),options:y.BJ,value:R,onChange:function(e){e===c.WC&&q(c.WC),z(e)}}),"No filter"!==R&&(0,a.Y)(p.c,{}),"Common"===R&&(0,a.Y)(x,{value:W,onChange:q}),"Calendar"===R&&(0,a.Y)(F,{value:W,onChange:q}),"Current"===R&&(0,a.Y)(A,{value:W,onChange:q}),"Advanced"===R&&(0,a.Y)(V,{value:W,onChange:q}),"Custom"===R&&(0,a.Y)(O,{value:W,onChange:q,isOverflowingFilterBar:D}),"No filter"===R&&(0,a.Y)("div",{}),(0,a.Y)(p.c,{}),(0,a.FD)("div",{children:[(0,a.Y)("div",{className:"section-title",children:(0,s.t)("Actual time range")}),Z&&(0,a.Y)("div",{children:"No filter"===J?(0,s.t)("No filter"):J}),!Z&&(0,a.FD)(B,{className:"warning",children:[(0,a.Y)(f.F.ExclamationCircleOutlined,{iconColor:Q.colorError}),(0,a.Y)("span",{className:"text error",children:J})]})]}),(0,a.Y)(p.c,{}),(0,a.FD)("div",{className:"footer",children:[(0,a.Y)(m.$,{buttonStyle:"secondary",cta:!0,onClick:ne,children:(0,s.t)("CANCEL")},"cancel"),(0,a.Y)(m.$,{buttonStyle:"primary",cta:!0,disabled:!Z,onClick:function(){r(W),k(!1),w()},children:(0,s.t)("APPLY")},"apply")]})]}),le=(0,a.Y)(b.A,{autoAdjustOverflow:!1,trigger:"click",placement:"right",content:ae,title:(0,a.FD)(B,{children:[(0,a.Y)(f.F.EditOutlined,{}),(0,a.Y)("span",{className:"text",children:(0,s.t)("Edit time range")})]}),defaultOpen:T,open:T,onOpenChange:()=>{T?ne():(q(S),z(I),k(!0),u())},overlayStyle:{width:"600px"},destroyTooltipOnHide:!0,getPopupContainer:e=>D?e.parentNode:document.body,overlayClassName:"time-range-popover",children:(0,a.Y)(v.m,{placement:"top",title:j,children:(0,a.Y)(P,{name:n,"aria-labelledby":`filter-name-${e.name}`,"aria-describedby":`date-label-${e.name}`,label:E,isActive:T,isPlaceholder:E===c.WC,ref:ee})})});return(0,a.FD)(a.FK,{children:[(0,a.Y)(g.A,{...e}),le]})}}}]);