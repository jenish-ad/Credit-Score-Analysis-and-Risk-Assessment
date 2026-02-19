#  Credit Score Risk Analysis System

A full-stack web application that simulates how financial institutions
evaluate loan applicants using structured database relationships,
financial scoring logic, and risk modeling.

 

##  Project Overview

The **Credit Score Risk Analysis System** calculates:

-    Credit Score (300 -- 850)
-    Risk Level (Low / Medium / High)
-    Defaulter Probability
-    Loan Approval Decisions (Admin-Based)

This project demonstrates practical implementation of DBMS concepts,
financial risk modeling, and full-stack development.

 

##  Objectives

-   Design and implement a normalized relational database for loan
    management.
-   Calculate dynamic credit scores based on financial behavior.
-   Evaluate loan applications using risk and probability models.
-   Implement an admin-controlled approval workflow.
-   Integrate frontend, backend, and database into a complete system.

 

##  Technologies Used

### Frontend

-   React
-   Tailwind CSS
-   React Router

### Backend

-   Django
-   Django REST Framework
-   JWT Authentication

### Database

-   PostgreSQL

 

##  System Architecture

Three-Tier Architecture:

Presentation Layer → React (Frontend)\
Application Layer → Django REST API (Backend)\
Data Layer → PostgreSQL Database

 

##  Database Design

### Main Entities

-   User\
-   Loan\
-   Payment\
-   Evaluation

### Relationships

-   One User → Multiple Loans\
-   One Loan → Multiple Payments\
-   One Loan → One Evaluation

 

##  Credit Score Calculation

### Factors & Weights

-   Payment History -- 35%
-   Credit Utilization -- 30%
-   Loan Burden -- 20%
-   Loan History -- 10%
-   Recent Activity -- 5%

### Formula

Credit Score = (Payment Score × 0.35) + (Utilization Score × 0.30) +
(Loan Burden Score × 0.20) + (History Score × 0.10) + (Activity Score ×
0.05)

Score Range: 300 -- 850

 

##  Defaulter Probability Calculation

Factors considered:

-   Debt-to-Income Ratio (DTI)
-   Credit Utilization
-   Missed Payments
-   Active Loan Count
-   Credit Score Band

DTI Formula:

DTI = Total EMI / Monthly Income

Risk Levels: - Low Risk - Medium Risk - High Risk

 

##  Loan Workflow

1.  User applies for a loan.
2.  Loan details are stored.
3.  Credit score does not change immediately.
4.  Admin reviews application.
5.  System calculates risk & default probability.
6.  Admin approves or rejects:
    -   If Approved → Loan becomes active & credit score updates.
    -   If Rejected → No change in credit score.

 

##  Features

-   JWT-Based Authentication
-   Credit Score Dashboard
-   Risk Band Display
-   Loan Application System
-   Payment Recording System
-   Credit Utilization Tracking
-   Defaulter Probability Estimation
-   Admin Evaluation Panel

 

##  Installation Guide

### Backend Setup

git clone https://github.com/your-username/CREDIT-RISK.git\
cd backend\
python -m venv venv

Activate: Windows: venv`\Scripts`{=tex}`\activate  `{=tex} Mac/Linux:
source venv/bin/activate

pip install -r requirements.txt\
python manage.py migrate\
python manage.py runserver

### Frontend Setup

cd frontend\
npm install\
npm run dev

 

##  Future Improvements

-   Machine Learning-Based Risk Prediction
-   Logistic Regression Probability Model
-   AI-Based Fraud Detection
-   Cloud Deployment

 

##  Conclusion

This system integrates DBMS design, backend business logic, and frontend
visualization to simulate a real-world credit scoring and loan
evaluation system.
