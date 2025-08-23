"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ResetPassword;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const emailLayout_1 = require("../components/emailLayout");
const config_1 = require("../../src/utils/config");
function ResetPassword({ firstName, link }) {
    return ((0, jsx_runtime_1.jsxs)(components_1.Html, { children: [(0, jsx_runtime_1.jsx)(components_1.Preview, { children: "Reset Your Password" }), (0, jsx_runtime_1.jsx)(components_1.Tailwind, { children: (0, jsx_runtime_1.jsx)(components_1.Body, { children: (0, jsx_runtime_1.jsx)(emailLayout_1.default, { children: (0, jsx_runtime_1.jsxs)(components_1.Row, { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xl font-semibold", style: { fontSize: '25px' }, children: "Reset Password" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { children: ["Hi ", firstName, ","] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: "text-justify mb-5", children: ["You recently asked to reset your ", config_1.CONFIG_VARIABLES.APP_NAME, ' ', "password, please click the link below to reset your password"] }), (0, jsx_runtime_1.jsx)("a", { href: link, className: "text-center text-white bg-black text-2xl my-10 font-bold rounded-xl no-underline px-8 py-4", children: "RESET PASSWORD" })] }) }) }) })] }));
}
//# sourceMappingURL=resetPassword.js.map