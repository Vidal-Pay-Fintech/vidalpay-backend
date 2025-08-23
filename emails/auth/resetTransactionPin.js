"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ResetTransactionPin;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const emailLayout_1 = require("../components/emailLayout");
const config_1 = require("../../src/utils/config");
function ResetTransactionPin({ firstName, otp }) {
    return ((0, jsx_runtime_1.jsxs)(components_1.Html, { children: [(0, jsx_runtime_1.jsx)(components_1.Preview, { children: "Reset Transaction Pin" }), (0, jsx_runtime_1.jsx)(components_1.Tailwind, { children: (0, jsx_runtime_1.jsx)(components_1.Body, { children: (0, jsx_runtime_1.jsx)(emailLayout_1.default, { children: (0, jsx_runtime_1.jsxs)(components_1.Row, { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xl font-semibold", style: { fontSize: '25px' }, children: "Reset Transaction Pin" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { children: ["Hi ", firstName, ","] }), (0, jsx_runtime_1.jsxs)(components_1.Text, { className: "text-justify mb-5", children: ["You recently asked to reset your ", config_1.CONFIG_VARIABLES.APP_NAME, ' ', "transaction pin, please copy the verification code into the app to reset."] }), (0, jsx_runtime_1.jsx)(components_1.Button, { className: "text-center bg-black text-white text-2xl my-5 font-bold rounded-xl no-underline px-8 py-4", children: otp })] }) }) }) })] }));
}
//# sourceMappingURL=resetTransactionPin.js.map