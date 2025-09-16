"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = NewUserRegistrationNotification;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const emailLayout_1 = require("../components/emailLayout");
function NewUserRegistrationNotification({ userName }) {
    return ((0, jsx_runtime_1.jsxs)(components_1.Html, { children: [(0, jsx_runtime_1.jsx)(components_1.Preview, { children: "New User Registered on LottoNowNow" }), (0, jsx_runtime_1.jsx)(components_1.Tailwind, { children: (0, jsx_runtime_1.jsx)(components_1.Body, { children: (0, jsx_runtime_1.jsx)(emailLayout_1.default, { children: (0, jsx_runtime_1.jsxs)(components_1.Row, { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xl font-semibold", style: { fontSize: '25px' }, children: "New User Registration Alert" }), (0, jsx_runtime_1.jsx)(components_1.Text, { children: "Hello Team," }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: "text-justify", children: ["A new user, ", (0, jsx_runtime_1.jsx)("strong", { children: userName }), ", has registered on LottoNowNow."] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: "Please review their profile to ensure compliance with our platform policies. If further verification is required, take the necessary actions." })] }) }) }) })] }));
}
//# sourceMappingURL=newRegistration.js.map