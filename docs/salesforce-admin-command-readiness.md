# Salesforce Admin Command Readiness

CaseForge uses Trailhead's admin credential preparation content as a practical baseline for Salesforce automation authoring.

Source reviewed:

- Trailhead badge: Agentforce 360 Platform Basics
- Credential trailmix context: Prepare for Your Salesforce Administrator Credential
- Visible unit areas: data platform basics, platform use cases, Salesforce architecture, Setup navigation, AppExchange, and configuration management

Command library coverage added:

- Setup navigation: `salesforceOpenSetup`, `salesforceSearchSetup`
- Object Manager: `salesforceOpenObjectManager`, `salesforceVerifyFieldConfig`, `salesforceVerifyPageLayout`
- Data and records: `salesforceCreateRecord`, `salesforceUpdateRecord`, `salesforceVerifyRecordField`, `salesforceImportData`
- Business automation: `salesforceVerifyValidationRule`, `salesforceRunFlow`
- Security model: `salesforceVerifyPermissionAccess`, `salesforceAssignPermissionSet`, `salesforceLoginAsUser`
- Analytics: `salesforceRunReport`, `salesforceVerifyDashboard`
- AppExchange and governance: `salesforceInstallAppExchangePackage`, `salesforceVerifySetupAuditTrail`

These commands are currently first-class authoring commands with planned runtime adapters. They let Salesforce manual cases become admin-shaped automation drafts without forcing the AI to describe everything as generic clicks and text assertions.
