"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ResetPasswordOTP;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const emailLayout_1 = require("../components/emailLayout");
function ResetPasswordOTP({ firstName, code }) {
    return ((0, jsx_runtime_1.jsxs)(components_1.Html, { children: [(0, jsx_runtime_1.jsx)(components_1.Preview, { children: "Reset Your Password" }), (0, jsx_runtime_1.jsx)(components_1.Tailwind, { children: (0, jsx_runtime_1.jsx)(components_1.Body, { children: (0, jsx_runtime_1.jsx)(emailLayout_1.default, { children: (0, jsx_runtime_1.jsxs)(components_1.Row, { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xl font-semibold", style: { fontSize: '25px' }, children: "Reset Password" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { children: ["Hi ", firstName, ","] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: "You recently asked to reset your VidalPay password, please use the OTP below to reset your password" }), (0, jsx_runtime_1.jsx)("h1", { className: "text-center text-5xl font-bold", style: { color: '#D3790D', fontSize: '40px' }, children: code })] }) }) }) })] }));
}
//# sourceMappingURL=reset-password-otp.js.map