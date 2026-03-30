"use strict";(globalThis.webpackChunksuperset=globalThis.webpackChunksuperset||[]).push([[7788],{37788:(e,t,i)=>{i.d(t,{Ay:()=>q,rE:()=>y});var n,o=i(2445),l=i(24002),r=i(25929),a=i(46942),s=i.n(a),c=i(74098),d=i(17437),m=i(54603),p=i(81465),u=i(81115),h=i(29645),g=i(43303),x=i(95018),b=i(27509),v=i(8558),f=i(92026),$=i(9876),z=i(13130);!function(e){e.AllCharts="ALL_CHARTS",e.Featured="FEATURED",e.Category="CATEGORY",e.Tags="TAGS"}(n||(n={}));const y=1090,C=(0,c.t)("Other"),k=(0,c.t)("All charts"),U=(0,c.t)("Featured"),Y=[U,(0,c.t)("ECharts"),(0,c.t)("Advanced-Analytics")],w=p.I4.div`
  ${({isSelectedVizMetadata:e})=>`\n    display: grid;\n    grid-template-rows: ${e?"auto minmax(100px, 1fr) minmax(200px, 35%)":"auto minmax(100px, 1fr)"};\n    // em is used here because the sidebar should be sized to fit the longest standard tag\n    grid-template-columns: minmax(14em, auto) 5fr;\n    grid-template-areas:\n      'sidebar search'\n      'sidebar main'\n      'details details';\n    height: 70vh;\n    overflow: auto;\n  `}
`,S=p.I4.h3`
  margin-top: 0;
  margin-bottom: ${({theme:e})=>2*e.sizeUnit}px;
  font-size: ${({theme:e})=>e.fontSizeLG}px;
  font-weight: ${({theme:e})=>e.fontWeightStrong};
  line-height: ${({theme:e})=>6*e.sizeUnit}px;
`,A=p.I4.div`
  grid-area: sidebar;
  display: flex;
  flex-direction: column;
  border-right: 1px solid ${({theme:e})=>e.colorBorder};
  overflow: auto;

  .ant-collapse .ant-collapse-item {
    .ant-collapse-header {
      font-size: ${({theme:e})=>e.fontSizeSM}px;
      color: ${({theme:e})=>e.colorText};
      padding-left: ${({theme:e})=>2*e.sizeUnit}px;
      padding-bottom: ${({theme:e})=>e.sizeUnit}px;
    }

    .ant-collapse-content .ant-collapse-content-box {
      display: flex;
      flex-direction: column;
      padding: 0 ${({theme:e})=>2*e.sizeUnit}px;
    }
  }
`,F=p.I4.div`
  grid-area: main;
  overflow-y: auto;
`,I=p.I4.div`
  ${({theme:e})=>`\n    grid-area: search;\n    margin-top: ${3*e.sizeUnit}px;\n    margin-bottom: ${e.sizeUnit}px;\n    margin-left: ${3*e.sizeUnit}px;\n    margin-right: ${3*e.sizeUnit}px;\n    .ant-input-affix-wrapper {\n      padding-left: ${2*e.sizeUnit}px;\n    }\n  `}
`,D=p.I4.div`
  display: flex;
  justify-content: center;
  align-items: center;
  color: ${({theme:e})=>e.colorIcon};
`,M=p.I4.button`
  ${({theme:e})=>`\n    all: unset; // remove default button styles\n    display: flex;\n    flex-direction: row;\n    align-items: center;\n    cursor: pointer;\n    margin: ${e.sizeUnit}px 0;\n    padding: 0 ${e.sizeUnit}px;\n    border-radius: ${e.borderRadius}px;\n    line-height: 2em;\n    text-overflow: ellipsis;\n    white-space: nowrap;\n    position: relative;\n    color: ${e.colorText};\n\n    &:focus {\n      outline: initial;\n    }\n\n    &.selected {\n      background-color: ${e.colorPrimary};\n      color: ${e.colorTextLightSolid};\n\n      svg {\n        color: ${e.colorTextLightSolid};\n      }\n\n      &:hover {\n        .cancel {\n          visibility: visible;\n        }\n      }\n    }\n\n    & > span[role="img"] {\n      margin-right: ${2*e.sizeUnit}px;\n    }\n\n    .cancel {\n      visibility: hidden;\n    }\n  `}
`,E=p.I4.div`
  overflow: auto;
  display: grid;
  grid-template-columns: repeat(
    auto-fill,
    ${({theme:e})=>24*e.sizeUnit}px
  );
  grid-auto-rows: max-content;
  justify-content: space-evenly;
  grid-gap: ${({theme:e})=>2*e.sizeUnit}px;
  justify-items: center;
  // for some reason this padding doesn't seem to apply at the bottom of the container. Why is a mystery.
  padding: ${({theme:e})=>2*e.sizeUnit}px;
`,T=e=>d.AH`
  grid-area: details;
  border-top: 1px solid ${e.colorBorder};
`,O=e=>d.AH`
  padding: ${4*e.sizeUnit}px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: auto auto 1fr;
  grid-template-areas:
    'viz-name examples-header'
    'viz-tags examples'
    'description examples';
`,B=p.I4.div`
  grid-area: viz-tags;
  width: ${({theme:e})=>120*e.sizeUnit}px;
  padding-right: ${({theme:e})=>14*e.sizeUnit}px;
  padding-bottom: ${({theme:e})=>2*e.sizeUnit}px;
`,H=p.I4.p`
  grid-area: description;
  overflow: auto;
  padding-right: ${({theme:e})=>14*e.sizeUnit}px;
  margin: 0;
`,N=p.I4.div`
  grid-area: examples;
  display: flex;
  flex-direction: row;
  flex-wrap: nowrap;
  overflow: auto;
  gap: ${({theme:e})=>4*e.sizeUnit}px;

  img {
    height: 100%;
    border-radius: ${({theme:e})=>e.borderRadius}px;
    border: 1px solid ${({theme:e})=>e.colorBorder};
    background-color: ${({theme:e})=>e.colorBgContainer};
  }
`,R=e=>d.AH`
  cursor: pointer;
  width: ${24*e.sizeUnit}px;
  position: relative;
  outline: none; /* Remove focus outline to show only selected state */

  img {
    min-width: ${24*e.sizeUnit}px;
    min-height: ${24*e.sizeUnit}px;
    border: 1px solid ${e.colorBorder};
    border-radius: ${e.borderRadius}px;
    transition: border-color ${e.motionDurationMid};
    background-color: ${e.colorBgContainer};
  }

  &.selected img {
    border: 2px solid ${e.colorPrimaryBorder};
  }

  &:hover:not(.selected) img {
    border: 1px solid ${e.colorBorder};
  }

  .viztype-label {
    margin-top: ${2*e.sizeUnit}px;
    text-align: center;
  }
`,P=p.I4.div`
  ${({theme:e})=>`\n    border: 1px solid ${e.colorPrimaryText};\n    box-sizing: border-box;\n    border-radius: ${e.borderRadius}px;\n    background: ${e.colorBgContainer};\n    line-height: ${2.5*e.sizeUnit}px;\n    color: ${e.colorPrimaryText};\n    font-size: ${e.fontSizeSM}px;\n    font-weight: ${e.fontWeightStrong};\n    text-align: center;\n    padding: ${.5*e.sizeUnit}px ${e.sizeUnit}px;\n    cursor: pointer;\n\n    div {\n      transform: scale(0.83,0.83);\n    }\n  `}
`,j=p.I4.div`
  position: absolute;
  right: ${({theme:e})=>e.sizeUnit}px;
  top: ${({theme:e})=>19*e.sizeUnit}px;
`,L=p.I4.div`
  display: inline-block !important;
  margin-left: ${({theme:e})=>2*e.sizeUnit}px;
`,V=({entry:e,selectedViz:t,setSelectedViz:i,onDoubleClick:n})=>{const l=(0,p.DP)(),r=(0,m.Mw)(l),{key:a,value:s}=e,d=t===e.key;return(0,o.FD)("div",{role:"button",css:R(l),tabIndex:0,className:d?"selected":"",onClick:()=>i(a),onDoubleClick:n,onKeyDown:e=>{"Enter"!==e.key&&" "!==e.key||(e.preventDefault(),i(a))},onFocus:()=>{i(a)},children:[(0,o.Y)("img",{alt:s.name,width:"100%",className:"viztype-selector "+(d?"selected":""),src:r&&s.thumbnailDark?s.thumbnailDark:s.thumbnail}),(0,o.Y)("div",{className:"viztype-label",children:s.name}),s.label&&(0,o.Y)(j,{children:(0,o.Y)(P,{children:(0,o.Y)("div",{children:(0,c.t)(s.label)})})})]})},G=({vizEntries:e,...t})=>(0,o.Y)(E,{children:e.map(e=>(0,o.Y)(V,{...t,entry:e},e.key))}),K=({selector:e,sectionId:t,icon:i,isSelected:n,onClick:r,className:a})=>{const d=(0,l.useRef)(null);return(0,l.useEffect)(()=>{n&&queueMicrotask(()=>(0,z.A)(d.current,{behavior:"smooth",scrollMode:"if-needed"}))},[]),(0,o.FD)(M,{"aria-label":e,"aria-selected":n,ref:d,name:e,className:s()(a,n&&"selected"),onClick:()=>r(e,t),tabIndex:0,role:"tab",children:[i,(0,c.t)(e)]},e)},W=(e,t)=>t===e.category||t===C&&null==e.category||(e.tags||[]).indexOf(t)>-1;function q(e){var t,i;const a=(0,p.DP)(),s=(0,m.Mw)(a),{selectedViz:z,onChange:y,onDoubleClick:M,className:E,denyList:R}=e,{mountedPluginMetadata:j}=(0,$.Q)(),V=(0,l.useRef)(),[q,J]=(0,l.useState)(""),[Q,_]=(0,l.useState)(!0),X=Q&&!!q,Z=z?j[z]:null,ee=(0,l.useMemo)(()=>Object.entries(j).map(([e,t])=>({key:e,value:t})).filter(({key:e})=>!R.includes(e)).filter(({value:e})=>(0,f.px)(e.behaviors||[])&&!e.deprecated).sort((e,t)=>e.value.name.localeCompare(t.value.name)),[j,R]),te=(0,l.useMemo)(()=>{const e={};return ee.forEach(t=>{const i=t.value.category||C;e[i]||(e[i]=[]),e[i].push(t)}),e},[ee]),ie=(0,l.useMemo)(()=>Object.keys(te).sort((e,t)=>e===C?1:t===C?-1:e.localeCompare(t)),[te]),ne=(0,l.useMemo)(()=>{const e={};return ee.forEach(t=>{(t.value.tags||[]).forEach(i=>{e[i]||(e[i]=[]),e[i].push(t)})}),e},[ee]),oe=(0,l.useMemo)(()=>Object.keys(ne).sort((e,t)=>e.localeCompare(t)).filter(e=>-1===Y.indexOf(e)),[ne]),le=(0,l.useMemo)(()=>ee.sort((e,t)=>e.value.name.localeCompare(t.value.name)),[ee]),[re,ae]=(0,l.useState)(()=>(null==Z?void 0:Z.category)||U),[se,ce]=(0,l.useState)(()=>null!=Z&&Z.category?n.Category:n.Featured),de=(0,l.useMemo)(()=>new r.A(ee,{ignoreLocation:!0,threshold:.3,keys:[{name:"value.name",weight:4},{name:"value.tags",weight:2},"value.description"]}),[ee]),me=(0,l.useMemo)(()=>""===q.trim()?[]:de.search(q).map(e=>e.item).sort((e,t)=>{var i,n;const o=null==(i=e.value)?void 0:i.label,l=null==(n=t.value)?void 0:n.label,r=o&&u.l7[o]?u.l7[o].weight:0;return(l&&u.l7[l]?u.l7[l].weight:0)-r}),[q,de]),pe=(0,l.useCallback)(()=>{_(!0)},[]);(0,l.useEffect)(()=>{V.current&&V.current.focus()},[]);const ue=(0,l.useCallback)(e=>J(e.target.value),[]),he=(0,l.useCallback)(()=>{_(!1),J(""),V.current.blur()},[]),ge=(0,l.useCallback)((e,t)=>{Q&&he(),ae(e),ce(t);const i=Z&&W(Z,e);e===re||i||y(null)},[he,Q,re,Z,y]),xe=(0,l.useMemo)(()=>({[n.Category]:{title:(0,c.t)("Category"),icon:(0,o.Y)(v.F.Category,{iconSize:"m"}),selectors:ie},[n.Tags]:{title:(0,c.t)("Tags"),icon:(0,o.Y)(v.F.NumberOutlined,{iconSize:"m"}),selectors:oe}}),[ie,oe]);return(0,o.FD)(w,{className:E,isSelectedVizMetadata:Boolean(Z),children:[(0,o.FD)(A,{"aria-label":(0,c.t)("Choose chart type"),role:"tablist",children:[(0,o.Y)(K,{css:({sizeUnit:e})=>d.AH`
              margin: ${2*e}px;
              margin-bottom: 0;
            `,sectionId:n.AllCharts,selector:k,icon:(0,o.Y)(v.F.Ballot,{iconSize:"m"}),isSelected:!X&&k===re&&n.AllCharts===se,onClick:ge}),(0,o.Y)(K,{css:({sizeUnit:e})=>d.AH`
              margin: ${2*e}px;
              margin-bottom: 0;
            `,sectionId:n.Featured,selector:U,icon:(0,o.Y)(v.F.FireOutlined,{iconSize:"m"}),isSelected:!X&&U===re&&n.Featured===se,onClick:ge}),(0,o.Y)(g.S,{expandIconPosition:"end",ghost:!0,defaultActiveKey:n.Category,items:Object.keys(xe).map(e=>{const t=xe[e];return{key:e,label:(0,o.Y)("span",{className:"header",children:t.title}),children:(0,o.Y)(o.FK,{children:t.selectors.map(i=>(0,o.Y)(K,{selector:i,sectionId:e,icon:t.icon,isSelected:!X&&i===re&&e===se,onClick:ge},i))})}})})]}),(0,o.Y)(I,{children:(0,o.Y)(h.Input,{type:"text",ref:V,value:q,placeholder:(0,c.t)("Search all charts"),onChange:ue,onFocus:pe,prefix:(0,o.Y)(D,{children:(0,o.Y)(v.F.SearchOutlined,{iconSize:"m"})}),suffix:(0,o.Y)(D,{children:q&&(0,o.Y)(v.F.CloseOutlined,{iconSize:"m",onClick:he})})})}),(0,o.Y)(F,{children:(0,o.Y)(G,{vizEntries:X?me:re===k&&se===n.AllCharts?le:re===U&&se===n.Featured&&ne[U]?ne[U]:se===n.Category&&te[re]?te[re]:se===n.Tags&&ne[re]?ne[re]:[],selectedViz:z,setSelectedViz:y,onDoubleClick:M})}),Z?(0,o.Y)("div",{css:e=>[T(e),O(e)],children:(0,o.FD)(o.FK,{children:[(0,o.FD)(S,{css:d.AH`
                grid-area: viz-name;
                position: relative;
              `,children:[null==Z?void 0:Z.name,(null==Z?void 0:Z.label)&&(0,o.Y)(x.m,{id:"viz-badge-tooltip",placement:"top",title:null!=(t=Z.labelExplanation)?t:u.HE[Z.label],children:(0,o.Y)(L,{children:(0,o.Y)(P,{children:(0,o.Y)("div",{children:(0,c.t)(Z.label)})})})})]}),(0,o.Y)(B,{children:null==Z?void 0:Z.tags.map(e=>(0,o.Y)(b.JU,{css:({sizeUnit:e})=>d.AH`
                    margin-bottom: ${2*e}px;
                  `,children:e},e))}),(0,o.Y)(H,{children:(0,c.t)((null==Z?void 0:Z.description)||"No description available.")}),(0,o.Y)(S,{css:d.AH`
                grid-area: examples-header;
              `,children:(0,c.t)("Examples")}),(0,o.Y)(N,{children:(null!=Z&&null!=(i=Z.exampleGallery)&&i.length?Z.exampleGallery:[{url:null==Z?void 0:Z.thumbnail,caption:null==Z?void 0:Z.name}]).map(e=>(0,o.Y)("img",{src:s&&e.urlDark?e.urlDark:e.url,alt:e.caption,title:e.caption},e.url))})]})}):null]})}}}]);