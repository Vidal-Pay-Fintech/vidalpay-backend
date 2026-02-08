"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = VerificationEmail;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const emailLayout_1 = require("../components/emailLayout");
function VerificationEmail({ firstName, code }) {
    return ((0, jsx_runtime_1.jsxs)(components_1.Html, { children: [(0, jsx_runtime_1.jsx)(components_1.Preview, { children: "Welcome To VidalPay" }), (0, jsx_runtime_1.jsx)(components_1.Tailwind, { children: (0, jsx_runtime_1.jsx)(components_1.Body, { children: (0, jsx_runtime_1.jsx)(emailLayout_1.default, { children: (0, jsx_runtime_1.jsxs)(components_1.Row, { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xl font-semibold", style: { fontSize: '25px' }, children: "Welcome to VidalPay" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { children: ["Hi ", firstName, ","] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: "Thank you for registering to use VidalPay!" }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: "We're excited to have you on board! To complete your registration process, please use the following OTP:" }), (0, jsx_runtime_1.jsx)("h1", { className: "text-center text-5xl font-bold", style: { color: '#D3790D', fontSize: '40px' }, children: code })] }) }) }) })] }));
}
//# sourceMappingURL=welcome.js.map