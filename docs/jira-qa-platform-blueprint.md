# Jira-Like QA Platform Blueprint

## Goal

Evolve the current AI QA workspace into a Jira-style test management platform where:

- projects are first-class
- users and teams are real entities
- assignees are linked to user accounts
- test cases are managed like work items
- execution runs and results are tracked over time
- the AI generator becomes one capability inside a larger product

## Product Direction

Treat the current generator page as one module, not the whole app.

Target product areas:

1. Dashboard
2. Projects
3. Boards
4. Test Cases
5. Requirements
6. Test Runs
7. Reports
8. Users and Teams
9. Workflows and Permissions

## Recommended Domain Model

### User

- `id`
- `name`
- `email`
- `avatarUrl`
- `role`
- `isActive`
- `createdAt`
- `updatedAt`

### Team

- `id`
- `name`
- `key`
- `createdAt`
- `updatedAt`

### TeamMember

- `id`
- `teamId`
- `userId`
- `role`

### Project

- `id`
- `key`
- `name`
- `description`
- `teamId`
- `leadUserId`
- `status`
- `createdAt`
- `updatedAt`

### Sprint

- `id`
- `projectId`
- `name`
- `goal`
- `startDate`
- `endDate`
- `status`
- `createdAt`
- `updatedAt`

### Issue

This is the central Jira-like work item.

- `id`
- `projectId`
- `issueNumber`
- `issueKey`
- `type`
- `summary`
- `description`
- `status`
- `priority`
- `reporterId`
- `assigneeId`
- `sprintId`
- `parentIssueId`
- `dueDate`
- `createdAt`
- `updatedAt`

### IssueLabel

- `id`
- `issueId`
- `label`

### Comment

- `id`
- `issueId`
- `authorId`
- `body`
- `createdAt`
- `updatedAt`

### ActivityLog

- `id`
- `entityType`
- `entityId`
- `action`
- `actorId`
- `beforeJson`
- `afterJson`
- `createdAt`

### Requirement

- `id`
- `projectId`
- `sourceType`
- `title`
- `rawContent`
- `normalizedContent`
- `version`
- `isActive`
- `createdById`
- `createdAt`
- `updatedAt`

### TestCase

Keep this as a specialized QA record linked to an issue.

- `id`
- `projectId`
- `issueId`
- `requirementId`
- `caseKey`
- `title`
- `objective`
- `preconditions`
- `steps`
- `expectedResult`
- `testData`
- `automationStatus`
- `createdAt`
- `updatedAt`

### TestExecutionRun

- `id`
- `projectId`
- `sprintId`
- `name`
- `description`
- `status`
- `createdById`
- `createdAt`
- `updatedAt`

### TestExecutionResult

- `id`
- `runId`
- `testCaseId`
- `executedById`
- `result`
- `actualResult`
- `notes`
- `defectIssueId`
- `executedAt`

### Attachment

- `id`
- `entityType`
- `entityId`
- `fileName`
- `fileUrl`
- `uploadedById`
- `createdAt`

## Recommended Enums

### UserRole

- `admin`
- `manager`
- `tester`
- `reviewer`

### ProjectStatus

- `active`
- `archived`

### SprintStatus

- `planned`
- `active`
- `completed`

### IssueType

- `epic`
- `story`
- `task`
- `bug`
- `test-case`
- `test-plan`
- `test-run`

### IssueStatus

- `backlog`
- `todo`
- `in_progress`
- `blocked`
- `in_review`
- `done`

### Priority

- `highest`
- `high`
- `medium`
- `low`

### ExecutionRunStatus

- `draft`
- `active`
- `closed`

### ExecutionResultStatus

- `not_run`
- `passed`
- `failed`
- `blocked`

### SourceType

Keep current values and extend only when needed.

## Prisma Schema Draft

```prisma
enum UserRole {
  admin
  manager
  tester
  reviewer
}

enum ProjectStatus {
  active
  archived
}

enum SprintStatus {
  planned
  active
  completed
}

enum IssueType {
  epic
  story
  task
  bug
  test_case
  test_plan
  test_run
}

enum IssueStatus {
  backlog
  todo
  in_progress
  blocked
  in_review
  done
}

enum Priority {
  highest
  high
  medium
  low
}

enum ExecutionRunStatus {
  draft
  active
  closed
}

enum ExecutionResultStatus {
  not_run
  passed
  failed
  blocked
}

model User {
  id              String                @id @default(cuid())
  name            String
  email           String                @unique
  avatarUrl       String?
  role            UserRole
  isActive        Boolean               @default(true)
  createdAt       DateTime              @default(now())
  updatedAt       DateTime              @updatedAt

  ledProjects     Project[]             @relation("ProjectLead")
  memberships     TeamMember[]
  reportedIssues  Issue[]               @relation("IssueReporter")
  assignedIssues  Issue[]               @relation("IssueAssignee")
  comments        Comment[]
  createdRequirements Requirement[]     @relation("RequirementCreator")
  createdRuns     TestExecutionRun[]    @relation("RunCreator")
  executions      TestExecutionResult[] @relation("ExecutionUser")
  uploads         Attachment[]
}

model Team {
  id          String       @id @default(cuid())
  name        String
  key         String       @unique
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  members     TeamMember[]
  projects    Project[]
}

model TeamMember {
  id          String   @id @default(cuid())
  teamId      String
  userId      String
  role        String

  team        Team     @relation(fields: [teamId], references: [id], onDelete: Cascade)
  user        User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([teamId, userId])
}

model Project {
  id          String         @id @default(cuid())
  key         String         @unique
  name        String
  description String?
  status      ProjectStatus  @default(active)
  teamId      String?
  leadUserId  String?
  createdAt   DateTime       @default(now())
  updatedAt   DateTime       @updatedAt

  team        Team?              @relation(fields: [teamId], references: [id])
  lead        User?              @relation("ProjectLead", fields: [leadUserId], references: [id])
  sprints     Sprint[]
  issues      Issue[]
  requirements Requirement[]
  testCases   TestCase[]
  executionRuns TestExecutionRun[]
}

model Sprint {
  id          String       @id @default(cuid())
  projectId   String
  name        String
  goal        String?
  startDate   DateTime?
  endDate     DateTime?
  status      SprintStatus @default(planned)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  project     Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  issues      Issue[]
  executionRuns TestExecutionRun[]
}

model Issue {
  id            String      @id @default(cuid())
  projectId      String
  issueNumber    Int
  issueKey       String      @unique
  type           IssueType
  summary        String
  description    String?
  status         IssueStatus @default(backlog)
  priority       Priority    @default(medium)
  reporterId     String?
  assigneeId     String?
  sprintId       String?
  parentIssueId  String?
  dueDate        DateTime?
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  project        Project     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  reporter       User?       @relation("IssueReporter", fields: [reporterId], references: [id])
  assignee       User?       @relation("IssueAssignee", fields: [assigneeId], references: [id])
  sprint         Sprint?     @relation(fields: [sprintId], references: [id])
  parentIssue    Issue?      @relation("IssueHierarchy", fields: [parentIssueId], references: [id])
  childIssues    Issue[]     @relation("IssueHierarchy")
  labels         IssueLabel[]
  comments       Comment[]
  testCase       TestCase?

  @@unique([projectId, issueNumber])
}

model IssueLabel {
  id          String   @id @default(cuid())
  issueId      String
  label        String

  issue        Issue    @relation(fields: [issueId], references: [id], onDelete: Cascade)
}

model Comment {
  id          String   @id @default(cuid())
  issueId      String
  authorId     String
  body         String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  issue        Issue    @relation(fields: [issueId], references: [id], onDelete: Cascade)
  author       User     @relation(fields: [authorId], references: [id], onDelete: Cascade)
}

model ActivityLog {
  id          String   @id @default(cuid())
  entityType   String
  entityId     String
  action       String
  actorId      String?
  beforeJson   Json?
  afterJson    Json?
  createdAt    DateTime @default(now())
}

model Requirement {
  id                String   @id @default(cuid())
  projectId         String
  sourceType        String
  title             String
  rawContent        String
  normalizedContent String
  version           Int      @default(1)
  isActive          Boolean  @default(true)
  createdById       String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  project           Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  createdBy         User?    @relation("RequirementCreator", fields: [createdById], references: [id])
  testCases         TestCase[]
}

model TestCase {
  id              String   @id @default(cuid())
  projectId        String
  issueId          String   @unique
  requirementId    String?
  caseKey          String   @unique
  title            String
  objective        String?
  preconditions    String
  steps            String
  expectedResult   String
  testData         String?
  automationStatus String?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  project          Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  issue            Issue        @relation(fields: [issueId], references: [id], onDelete: Cascade)
  requirement      Requirement? @relation(fields: [requirementId], references: [id], onDelete: SetNull)
  executionResults TestExecutionResult[]
}

model TestExecutionRun {
  id          String             @id @default(cuid())
  projectId    String
  sprintId     String?
  name         String
  description  String?
  status       ExecutionRunStatus @default(draft)
  createdById  String?
  createdAt    DateTime           @default(now())
  updatedAt    DateTime           @updatedAt

  project      Project            @relation(fields: [projectId], references: [id], onDelete: Cascade)
  sprint       Sprint?            @relation(fields: [sprintId], references: [id])
  createdBy    User?              @relation("RunCreator", fields: [createdById], references: [id])
  results      TestExecutionResult[]
}

model TestExecutionResult {
  id            String                @id @default(cuid())
  runId         String
  testCaseId    String
  executedById  String?
  result        ExecutionResultStatus @default(not_run)
  actualResult  String?
  notes         String?
  defectIssueId String?
  executedAt    DateTime?

  run           TestExecutionRun      @relation(fields: [runId], references: [id], onDelete: Cascade)
  testCase      TestCase              @relation(fields: [testCaseId], references: [id], onDelete: Cascade)
  executedBy    User?                 @relation("ExecutionUser", fields: [executedById], references: [id])
  defectIssue   Issue?                @relation(fields: [defectIssueId], references: [id])
}

model Attachment {
  id            String   @id @default(cuid())
  entityType     String
  entityId       String
  fileName       String
  fileUrl        String
  uploadedById   String?
  createdAt      DateTime @default(now())

  uploadedBy     User?    @relation(fields: [uploadedById], references: [id])
}
```

## Route and Screen Map

Recommended app routes:

### Workspace Level

- `/dashboard`
- `/projects`
- `/settings/users`
- `/settings/workflows`

### Project Level

- `/projects/[projectKey]`
- `/projects/[projectKey]/board`
- `/projects/[projectKey]/cases`
- `/projects/[projectKey]/requirements`
- `/projects/[projectKey]/runs`
- `/projects/[projectKey]/reports`

### Record Detail

- `/projects/[projectKey]/cases/[caseKey]`
- `/projects/[projectKey]/runs/[runId]`
- `/projects/[projectKey]/issues/[issueKey]`

## API Direction

Suggested API surface:

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/[key]`
- `PATCH /api/projects/[key]`

- `GET /api/projects/[key]/issues`
- `POST /api/projects/[key]/issues`
- `PATCH /api/issues/[id]`

- `GET /api/projects/[key]/cases`
- `POST /api/projects/[key]/cases`
- `PATCH /api/cases/[id]`

- `GET /api/projects/[key]/sprints`
- `POST /api/projects/[key]/sprints`

- `GET /api/projects/[key]/runs`
- `POST /api/projects/[key]/runs`
- `PATCH /api/runs/[id]`
- `PATCH /api/runs/[id]/results/[resultId]`

- `GET /api/users`
- `POST /api/users`

## Assignee Guidance

Assignees should be user-linked, not stored as raw text.

Use:

- `assigneeId`

Display:

- `name`
- `email`
- `avatar`

Avoid:

- `assignee: "John"`

That is not stable enough for a Jira-style system.

## Refactor Strategy

Do not keep expanding `app/page.tsx` as the whole product.

Instead:

1. Keep the current page as an AI/manual authoring module.
2. Move project management into dedicated routes.
3. Move board and case management into project pages.
4. Use services for business logic instead of keeping everything in one page component.

## Phased Delivery Plan

### Phase 1: Foundation

- add auth
- add real users
- add teams
- add project keys
- add issue model

### Phase 2: Test Case Normalization

- create first-class `TestCase`
- link `TestCase` to `Issue`
- migrate current row-based cases into the new model

### Phase 3: Board and Planning

- dedicated board page
- drag and drop status changes
- sprint assignment
- assignee picker
- filters and saved views

### Phase 4: Execution

- test runs
- pass/fail/blocked/not-run
- defect linkage
- execution summary

### Phase 5: Collaboration

- comments
- activity timeline
- watchers
- mentions

### Phase 6: Reporting

- release readiness
- blocked trends
- assignee workload
- sprint completion

## Best Immediate Next Build

The strongest next implementation milestone is:

1. Add `User` and `Team` to Prisma
2. Add `Issue`
3. Add `TestCase.issueId`
4. Create `/projects/[projectKey]/board`
5. Replace free-text assignee with a real user picker

That is the point where the app starts behaving like Jira instead of just looking inspired by it.

## Notes For This Repo

Current reality:

- the app already has useful QA logic
- the current `app/page.tsx` is feature-rich but overloaded
- the project is ready for modularization, not more page-level expansion

So the next implementation step should be a structural one, not another large feature jammed into the current page.
