"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = DrawIncompleteNotification;
const jsx_runtime_1 = require("react/jsx-runtime");
const components_1 = require("@react-email/components");
const emailLayout_1 = require("../components/emailLayout");
function DrawIncompleteNotification({ firstName }) {
    return ((0, jsx_runtime_1.jsxs)(components_1.Html, { children: [(0, jsx_runtime_1.jsx)(components_1.Preview, { children: "Update: LottoNowNow Draw Status" }), (0, jsx_runtime_1.jsx)(components_1.Tailwind, { children: (0, jsx_runtime_1.jsx)(components_1.Body, { children: (0, jsx_runtime_1.jsx)(emailLayout_1.default, { children: (0, jsx_runtime_1.jsxs)(components_1.Row, { children: [(0, jsx_runtime_1.jsx)("h4", { className: "text-xl font-semibold", style: { fontSize: '25px' }, children: "Important Update on Your LottoNowNow Draw" }), (0, jsx_runtime_1.jsxs)(components_1.Text, { children: ["Hi ", firstName, ","] }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: "Thank you for participating in the recent LottoNowNow draw. Unfortunately, the draw could not be completed as the minimum required ticket sales were not reached." }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: "As a result, the amount you used to purchase your ticket has been refunded to your LottoNowNow wallet. You can view the refunded amount by logging into your account." }), (0, jsx_runtime_1.jsx)(components_1.Text, { className: "text-justify", children: "We appreciate your understanding and invite you to check out our upcoming draws for more chances to win. Join in, and let\u2019s keep the excitement going!" })] }) }) }) })] }));
}
//# sourceMappingURL=refundTicket.js.map