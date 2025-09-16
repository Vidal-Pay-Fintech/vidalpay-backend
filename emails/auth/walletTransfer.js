'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.default = TransactionEmail;

const jsx_runtime_1 = require('react/jsx-runtime');
const components_1 = require('@react-email/components');
const emailLayout_1 = require('../components/emailLayout');

function TransactionEmail({ firstName, amount, info, currency }) {
  return (0, jsx_runtime_1.jsxs)(components_1.Html, {
    children: [
      (0, jsx_runtime_1.jsx)(components_1.Preview, {
        children: 'Transaction Notification - VidalPay',
      }),
      (0, jsx_runtime_1.jsx)(components_1.Tailwind, {
        children: (0, jsx_runtime_1.jsx)(components_1.Body, {
          children: (0, jsx_runtime_1.jsx)(emailLayout_1.default, {
            children: (0, jsx_runtime_1.jsxs)(components_1.Row, {
              children: [
                (0, jsx_runtime_1.jsx)('h4', {
                  className: 'text-xl font-semibold',
                  style: { fontSize: '25px' },
                  children: 'Transaction Alert',
                }),
                (0, jsx_runtime_1.jsxs)(components_1.Text, {
                  children: ['Hi ', firstName, ','],
                }),
                (0, jsx_runtime_1.jsx)(components_1.Text, {
                  className: 'text-justify',
                  children:
                    'We’re writing to let you know that a transaction has been processed on your VidalPay account.',
                }),
                (0, jsx_runtime_1.jsxs)(components_1.Text, {
                  className: 'text-justify',
                  children: [
                    (0, jsx_runtime_1.jsxs)('div', {
                      children: [
                        (0, jsx_runtime_1.jsxs)('p', {
                          children: [
                            (0, jsx_runtime_1.jsx)('strong', {
                              children: 'Amount: ',
                            }),
                            currency,
                            ' ',
                            amount,
                          ],
                        }),
                        (0, jsx_runtime_1.jsxs)('p', {
                          children: [
                            (0, jsx_runtime_1.jsx)('strong', {
                              children: 'Details: ',
                            }),
                            info,
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
                (0, jsx_runtime_1.jsx)(components_1.Text, {
                  className: 'text-justify',
                  children:
                    'If you made this transaction, no further action is needed. If you do not recognize it, please contact our support team immediately.',
                }),
                (0, jsx_runtime_1.jsxs)(components_1.Text, {
                  className: 'text-justify',
                  children: [
                    'Thank you for choosing ',
                    (0, jsx_runtime_1.jsx)('strong', { children: 'VidalPay' }),
                    '. We’re here to make your payments simple, secure, and fast.',
                  ],
                }),
                (0, jsx_runtime_1.jsx)(components_1.Text, {
                  className: 'mt-6 text-sm text-gray-500',
                  children:
                    'This is an automated message. Please do not reply directly to this email.',
                }),
              ],
            }),
          }),
        }),
      }),
    ],
  });
}
//# sourceMappingURL=walletTransaction.js.map
