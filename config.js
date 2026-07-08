require('dotenv').config();

module.exports = {
  BASE_URL: process.env.QA_BASE_URL,
  LOGIN_URL: `${process.env.QA_BASE_URL}/log/login`,
  DASHBOARD_URL: `${process.env.QA_BASE_URL}/dash/dashboard`,
  EMAIL: process.env.QA_EMAIL,
  PASSWORD: process.env.QA_PASSWORD,
};
