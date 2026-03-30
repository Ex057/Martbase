"use strict";(globalThis.webpackChunksuperset=globalThis.webpackChunksuperset||[]).push([[6830],{30613:(e,s,t)=>{t.d(s,{k:()=>d});var i=t(2445),n=t(24002),r=t(74098),a=t(88217),o=t(65729),l=t(97163);function d({show:e,onHide:s,title:t,onSave:d,children:c,initialValues:u={},formSubmitHandler:m,bodyStyle:h={},requiredFields:p=[],name:f}){const[w]=o.l.useForm(),[g,b]=(0,n.useState)(!1),Y=(0,n.useCallback)(()=>{w.resetFields(),b(!1)},[w]),[F,y]=(0,n.useState)(!0),S=(0,n.useCallback)(()=>{Y(),s()},[s,Y]),v=(0,n.useCallback)(()=>{Y(),d()},[d,Y]),x=(0,n.useCallback)(async e=>{try{b(!0),await m(e),v()}catch(e){console.error(e)}finally{b(!1)}},[m,v]),P=()=>{const e=w.getFieldsError().some(({errors:e})=>e.length),s=w.getFieldsValue(),t=p.some(e=>!s[e]);y(e||t)};return(0,i.Y)(l.aF,{name:f,show:e,title:t,onHide:S,bodyStyle:h,footer:(0,i.FD)(i.FK,{children:[(0,i.Y)(a.$,{buttonStyle:"secondary",onClick:S,children:(0,r.t)("Cancel")}),(0,i.Y)(a.$,{buttonStyle:"primary",htmlType:"submit",onClick:()=>w.submit(),disabled:g||F,children:g?(0,r.t)("Saving..."):(0,r.t)("Save")})]}),children:(0,i.Y)(o.l,{form:w,layout:"vertical",onFinish:x,initialValues:u,onValuesChange:P,onFieldsChange:P,children:"function"==typeof c?c(w):c})})}},90746:(e,s,t)=>{t.r(s),t.d(s,{UserInfo:()=>x,default:()=>P});var i=t(2445),n=t(24002),r=t(81465),a=t(17437),o=t(79378),l=t(74098),d=t(20237),c=t(64457),u=t(29645),m=t(82384),h=t(30613);function p({show:e,onHide:s,onSave:t,isEditMode:n,user:r}){const{addDangerToast:a,addSuccessToast:d}=(0,c.Yf)(),p=n?["first_name","last_name"]:["password","confirm_password"],f=n?{first_name:null==r?void 0:r.firstName,last_name:null==r?void 0:r.lastName}:{};return(0,i.Y)(h.k,{show:e,onHide:s,title:n?(0,l.t)("Edit user"):(0,l.t)("Reset password"),onSave:t,formSubmitHandler:async e=>{try{const{confirm_password:s,...i}=e;await o.A.put({endpoint:"/api/v1/me/",jsonPayload:{...i}}),d(n?(0,l.t)("The user was updated successfully"):(0,l.t)("The password reset was successful")),t()}catch(e){a((0,l.t)("Something went wrong while saving the user info"))}},requiredFields:p,initialValues:f,children:n?(0,i.Y)(()=>(0,i.FD)(i.FK,{children:[(0,i.Y)(m.e,{name:"first_name",label:(0,l.t)("First name"),rules:[{required:!0,message:(0,l.t)("First name is required")}],children:(0,i.Y)(u.Input,{name:"first_name",placeholder:(0,l.t)("Enter the user's first name")})}),(0,i.Y)(m.e,{name:"last_name",label:(0,l.t)("Last name"),rules:[{required:!0,message:(0,l.t)("Last name is required")}],children:(0,i.Y)(u.Input,{name:"last_name",placeholder:(0,l.t)("Enter the user's last name")})})]}),{}):(0,i.Y)(()=>(0,i.FD)(i.FK,{children:[(0,i.Y)(m.e,{name:"password",label:(0,l.t)("Password"),rules:[{required:!0,message:(0,l.t)("Password is required")}],children:(0,i.Y)(u.Input.Password,{name:"password",placeholder:"Enter the user's password"})}),(0,i.Y)(m.e,{name:"confirm_password",label:(0,l.t)("Confirm Password"),dependencies:["password"],rules:[{required:!0,message:(0,l.t)("Please confirm your password")},({getFieldValue:e})=>({validator:(s,t)=>t&&e("password")!==t?Promise.reject(new Error((0,l.t)("Passwords do not match!"))):Promise.resolve()})],children:(0,i.Y)(u.Input.Password,{name:"confirm_password",placeholder:(0,l.t)("Confirm the user's password")})})]}),{})})}const f=e=>(0,i.Y)(p,{...e,isEditMode:!1}),w=e=>(0,i.Y)(p,{...e,isEditMode:!0});var g=t(8558),b=t(43303);const Y=r.I4.div`
  ${({theme:e})=>a.AH`
    font-weight: ${e.fontWeightStrong};
    text-align: left;
    font-size: 18px;
    padding: ${3*e.sizeUnit}px;
    padding-left: ${7*e.sizeUnit}px;
    display: inline-block;
    line-height: ${9*e.sizeUnit}px;
    width: 100%;
    background-color: ${e.colorBgContainer};
    margin-bottom: ${6*e.sizeUnit}px;
  `}
`,F=r.I4.div`
  ${({theme:e})=>a.AH`
    margin: 0px ${3*e.sizeUnit}px ${6*e.sizeUnit}px
      ${3*e.sizeUnit}px;
    background-color: ${e.colorBgContainer};
  `}
`,y=r.I4.div`
  ${({theme:e})=>a.AH`
    .ant-row {
      margin: 0px ${3*e.sizeUnit}px ${6*e.sizeUnit}px
        ${3*e.sizeUnit}px;
    }
    && .menu > .ant-menu {
      padding: 0px;
    }
    && .nav-right {
      left: 0;
      padding-left: ${4*e.sizeUnit}px;
      position: relative;
      height: ${15*e.sizeUnit}px;
    }
  `}
`,S=r.I4.span`
  font-weight: ${({theme:e})=>e.fontWeightStrong};
`;var v;function x({user:e}){const s=(0,r.DP)(),[t,m]=(0,n.useState)({resetPassword:!1,edit:!1}),h=e=>m(s=>({...s,[e]:!0})),p=e=>m(s=>({...s,[e]:!1})),{addDangerToast:x}=(0,c.Yf)(),[P,$]=(0,n.useState)(e);(0,n.useEffect)(()=>{D()},[]);const D=(0,n.useCallback)(()=>{o.A.get({endpoint:"/api/v1/me/"}).then(({json:e})=>{const s={...e.result,firstName:e.result.first_name,lastName:e.result.last_name};$(s)}).catch(e=>{x("Failed to fetch user info:",e)})},[P]),I=[{name:(0,i.FD)(i.FK,{children:[(0,i.Y)(g.F.LockOutlined,{iconColor:s.colorPrimary,iconSize:"m",css:a.AH`
              margin: auto ${2*s.sizeUnit}px auto 0;
              vertical-align: text-top;
            `}),(0,l.t)("Reset my password")]}),buttonStyle:"secondary",onClick:()=>{h(v.ResetPassword)}},{name:(0,i.FD)(i.FK,{children:[(0,i.Y)(g.F.FormOutlined,{iconSize:"m",css:a.AH`
              margin: auto ${2*s.sizeUnit}px auto 0;
              vertical-align: text-top;
            `}),(0,l.t)("Edit user")]}),buttonStyle:"primary",onClick:()=>{h(v.Edit)}}];return(0,i.FD)(y,{children:[(0,i.Y)(Y,{children:"Your user information"}),(0,i.Y)(F,{children:(0,i.FD)(b.S,{defaultActiveKey:["userInfo","personalInfo"],ghost:!0,children:[(0,i.Y)(b.S.Panel,{header:(0,i.Y)(S,{children:"User info"}),children:(0,i.FD)(u.Descriptions,{bordered:!0,size:"small",column:1,labelStyle:{width:"120px"},children:[(0,i.Y)(u.Descriptions.Item,{label:"User Name",children:e.username}),(0,i.Y)(u.Descriptions.Item,{label:"Is Active?",children:e.isActive?"Yes":"No"}),(0,i.Y)(u.Descriptions.Item,{label:"Role",children:e.roles?Object.keys(e.roles).join(", "):"None"}),(0,i.Y)(u.Descriptions.Item,{label:"Login count",children:e.loginCount})]})},"userInfo"),(0,i.Y)(b.S.Panel,{header:(0,i.Y)(S,{children:"Personal info"}),children:(0,i.FD)(u.Descriptions,{bordered:!0,size:"small",column:1,labelStyle:{width:"120px"},children:[(0,i.Y)(u.Descriptions.Item,{label:"First Name",children:P.firstName}),(0,i.Y)(u.Descriptions.Item,{label:"Last Name",children:P.lastName}),(0,i.Y)(u.Descriptions.Item,{label:"Email",children:e.email})]})},"personalInfo")]})}),t.resetPassword&&(0,i.Y)(f,{onHide:()=>p(v.ResetPassword),show:t.resetPassword,onSave:()=>{p(v.ResetPassword)}}),t.edit&&(0,i.Y)(w,{onHide:()=>p(v.Edit),show:t.edit,onSave:()=>{p(v.Edit),D()},user:P}),(0,i.Y)(d.A,{buttons:I})]})}!function(e){e.ResetPassword="resetPassword",e.Edit="edit"}(v||(v={}));const P=x}}]);