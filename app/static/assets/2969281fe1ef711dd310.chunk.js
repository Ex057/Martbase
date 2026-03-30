(globalThis.webpackChunksuperset=globalThis.webpackChunksuperset||[]).push([[7094],{19049:(e,t,r)=>{var n=r(79920)("capitalize",r(14792),r(96493));n.placeholder=r(2874),e.exports=n},68793:(e,t,r)=>{"use strict";r.r(t),r.d(t,{default:()=>x});var n,i=r(19049),o=r.n(i),l=r(2445),a=r(74098),s=r(79378),c=r(17437),u=r(81465),d=r(65729),h=r(29645),m=r(8558),p=r(88217),g=r(4651),f=r(76576),A=r(42566),y=r(24002),b=r(91412),I=r(61225),Y=r(32064);!function(e){e[e.AuthOID=0]="AuthOID",e[e.AuthDB=1]="AuthDB",e[e.AuthLDAP=2]="AuthLDAP",e[e.AuthOauth=4]="AuthOauth"}(n||(n={}));const w=u.I4.div`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: ${({theme:e})=>e.colorBgBase};
  z-index: 9999;
  overflow-y: auto;
`,$=(0,u.I4)(g.Z)`
  ${({theme:e})=>c.AH`
    max-width: 400px;
    width: 100%;
    margin-top: ${e.marginXL}px;
    color: ${e.colorBgContainer};
    background: ${e.colorBgBase};
    .ant-form-item-label label {
      color: ${e.colorPrimary};
    }
  `}
`,D=(0,u.I4)(A.o.Text)`
  ${({theme:e})=>c.AH`
    font-size: ${e.fontSizeSM}px;
  `}
`;function x(){const[e]=d.l.useForm(),[t,r]=(0,y.useState)(!1),i=(0,I.wA)(),u=(0,Y.Ay)(),g=(0,y.useMemo)(()=>{try{return new URLSearchParams(window.location.search).get("next")||""}catch(e){return""}},[]),x=(0,y.useMemo)(()=>g?`/login/?next=${encodeURIComponent(g)}`:"/login/",[g]),S=e=>{const t=`/login/${e}`;return g?`${t}${t.includes("?")?"&":"?"}next=${encodeURIComponent(g)}`:t},k=u.common.conf.AUTH_TYPE,v=u.common.conf.AUTH_PROVIDERS,F=u.common.conf.AUTH_USER_REGISTRATION;(0,y.useEffect)(()=>{"true"===sessionStorage.getItem("login_attempted")&&(sessionStorage.removeItem("login_attempted"),i((0,b.iB)((0,a.t)("Invalid username or password"))),e.setFieldsValue({password:""}))},[i,e]);const P=e=>{if(!e||"string"!=typeof e)return;const t=`${o()(e)}Outlined`,r=m.F[t];return r&&"function"==typeof r?(0,l.Y)(r,{}):void 0};return(0,l.Y)(w,{children:(0,l.Y)(f.s,{justify:"center",align:"center",css:c.AH`
          width: 100%;
          min-height: 100vh;
        `,children:(0,l.FD)($,{title:(0,a.t)("Sign in"),padded:!0,children:[k===n.AuthOID&&(0,l.Y)(f.s,{justify:"center",vertical:!0,gap:"middle",children:(0,l.Y)(d.l,{layout:"vertical",requiredMark:"optional",form:e,children:v.map(e=>(0,l.Y)(d.l.Item,{children:(0,l.FD)(p.$,{href:S(e.name),block:!0,iconPosition:"start",icon:P(e.name),children:[(0,a.t)("Sign in with")," ",o()(e.name)]})}))})}),k===n.AuthOauth&&(0,l.Y)(f.s,{justify:"center",gap:0,vertical:!0,children:(0,l.Y)(d.l,{layout:"vertical",requiredMark:"optional",form:e,children:v.map(e=>(0,l.Y)(d.l.Item,{children:(0,l.FD)(p.$,{href:S(e.name),block:!0,iconPosition:"start",icon:P(e.name),children:[(0,a.t)("Sign in with")," ",o()(e.name)]})}))})}),(k===n.AuthDB||k===n.AuthLDAP)&&(0,l.FD)(f.s,{justify:"center",vertical:!0,gap:"middle",children:[(0,l.Y)(A.o.Text,{type:"secondary",children:(0,a.t)("Enter your login and password below:")}),(0,l.FD)(d.l,{layout:"vertical",requiredMark:"optional",form:e,onFinish:e=>{r(!0),sessionStorage.setItem("login_attempted","true"),s.A.postForm(x,e,"")},children:[(0,l.Y)(d.l.Item,{label:(0,l.Y)(D,{children:(0,a.t)("Username:")}),name:"username",rules:[{required:!0,message:(0,a.t)("Please enter your username")}],children:(0,l.Y)(h.Input,{autoFocus:!0,prefix:(0,l.Y)(m.F.UserOutlined,{iconSize:"l"})})}),(0,l.Y)(d.l.Item,{label:(0,l.Y)(D,{children:(0,a.t)("Password:")}),name:"password",rules:[{required:!0,message:(0,a.t)("Please enter your password")}],children:(0,l.Y)(h.Input.Password,{prefix:(0,l.Y)(m.F.KeyOutlined,{iconSize:"l"})})}),(0,l.Y)(d.l.Item,{label:null,children:(0,l.FD)(f.s,{vertical:!0,gap:"middle",css:c.AH`
                      width: 100%;
                    `,children:[(0,l.Y)(p.$,{block:!0,type:"primary",htmlType:"submit",loading:t,children:(0,a.t)("Sign in")}),F&&(0,l.Y)(p.$,{block:!0,type:"default",href:"/register/",children:(0,a.t)("Register")}),(0,l.FD)(p.$,{block:!0,type:"default",href:"/superset/public/",children:["← ",(0,a.t)("Back to Public Dashboards")]})]})})]})]})]})})})}},96493:e=>{e.exports={cap:!1,curry:!1,fixed:!1,immutable:!1,rearg:!1}}}]);