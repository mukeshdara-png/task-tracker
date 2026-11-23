# Task Tracker

A Spring Boot task tracker with a responsive browser UI and REST API. Tasks are stored in memory and reset when the application restarts.

## Project configuration

- Java: 21
- Spring Boot: 3.5.6
- Build tool: Maven
- Entry point: `com.example.tasktracker.TaskTrackerApplication`
- Executable JAR: `target/task-tracker-0.0.1-SNAPSHOT.jar`
- Default application/container port: 8080; override with `SERVER_PORT`
- API: `GET` and `POST /api/tasks`, `PATCH /api/tasks/{id}`, `DELETE /api/tasks/{id}`
- Health check: `/actuator/health`

The app previously configured port 8091, while the existing AWS target group listens on 8080. The app now uses `server.port=${SERVER_PORT:8080}`; the Docker image defaults `SERVER_PORT` and exposes 8080. This aligns with the supplied target group without changing AWS. You can override the port by setting `SERVER_PORT` and mapping the same container port when running Docker.

## Local development

Requirements: JDK 21 and Maven 3.9 or later.

Run tests and package the executable JAR:

```powershell
mvn -B verify
```

Run the app locally:

```powershell
mvn spring-boot:run
```

Open `http://localhost:8080`. To use another port, set `SERVER_PORT` in the environment before starting the app.

## Dockerfile

The multi-stage Dockerfile uses Maven with Eclipse Temurin 21 to build the executable JAR, then copies only that JAR into a lightweight Eclipse Temurin 21 JRE Alpine image. BuildKit cache mounts reduce repeat Maven downloads. The runtime runs as a non-root `app` user, defaults `SERVER_PORT=8080`, and contains no AWS credentials. `.dockerignore` excludes Git metadata, build output, editor files, local AWS config, environment files, and common key/secret files.

Build and run a local image for development (production images are built and pushed only by GitHub Actions):

```powershell
docker build -t task-tracker:local .
docker run --rm -p 8080:8080 task-tracker:local
```

## GitHub Actions CI and ECR publishing

Workflow: [`.github/workflows/docker-build-push.yml`](.github/workflows/docker-build-push.yml)

- Pull requests targeting `main` and pushes to `main` run `mvn -B verify`.
- Pull requests build the Docker image with Buildx after tests pass, without AWS authentication or image publishing.
- Only a push to `main` assumes the AWS role through GitHub OIDC, logs in to ECR, and pushes the image.
- Main-branch images have both an immutable commit-SHA tag and `latest`. Buildx uses separate PR and main cache scopes so pull-request builds cannot overwrite the main-branch cache.
- A failed build or test stops later jobs.

### GitHub configuration

Add these repository Actions settings under **Settings → Secrets and variables → Actions**:

| Name | Type | Value |
| --- | --- | --- |
| `AWS_ROLE_ARN` | Variable | `arn:aws:iam::100808729174:role/GitHubTaskTrackerDev` |
| `AWS_REGION` | Variable | `us-east-1` |
| `AWS_ACCOUNT_ID` | Variable | `100808729174` |
| `ECR_REPOSITORY` | Variable | `task-tracker` |

`AWS_ROLE_ARN` is a non-secret GitHub Actions variable and must be read with `vars.AWS_ROLE_ARN`; using `secrets.AWS_ROLE_ARN` when only a variable exists leaves the role ARN empty and prevents OIDC role assumption. No AWS access keys or secret keys are used. Third-party actions are pinned to reviewed release commit SHAs; review and update those pins periodically.

## AWS OIDC setup

The role should trust only the intended repository's `main` branch. First check whether the GitHub OIDC provider already exists; create it only if missing.

### Create the OIDC provider if needed

In the AWS Console, open **IAM → Identity providers → Add provider**:

1. Provider type: **OpenID Connect**.
2. Provider URL: `https://token.actions.githubusercontent.com`.
3. Audience: `sts.amazonaws.com`.
4. Add the provider. Do not create a second provider if one already exists.

### Configure the existing role trust policy

In **IAM → Roles → [existing GitHub Actions role] → Trust relationships**, ensure the trust policy has this audience and repository/branch restriction. Keep any unrelated, required existing statements only after reviewing them.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::100808729174:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": "repo:mukeshdara-png@242338459/task-tracker@1468700367:ref:refs/heads/main"
        }
      }
    }
  ]
}
```

Do not replace an existing role's trust policy blindly. Confirm the provider ARN in IAM and merge this restricted statement if other trusted workflows must remain.

### Least-privilege ECR push policy

Attach this permissions policy to the existing GitHub OIDC role. It permits authentication and upload only to the `task-tracker` ECR repository:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "ecr:GetAuthorizationToken",
      "Resource": "*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "ecr:BatchCheckLayerAvailability",
        "ecr:CompleteLayerUpload",
        "ecr:InitiateLayerUpload",
        "ecr:PutImage",
        "ecr:UploadLayerPart"
      ],
      "Resource": "arn:aws:ecr:us-east-1:100808729174:repository/task-tracker"
    }
  ]
}
```

The `Resource: "*"` on `ecr:GetAuthorizationToken` is required by ECR. No ECS permissions are needed for this image-publishing workflow. ECS task execution and deployment will be handled in a later phase.

## Image tags and expected results

Image repository: `100808729174.dkr.ecr.us-east-1.amazonaws.com/task-tracker`

On a successful push to `main`, the workflow pushes:

```text
100808729174.dkr.ecr.us-east-1.amazonaws.com/task-tracker:<full-git-commit-sha>
100808729174.dkr.ecr.us-east-1.amazonaws.com/task-tracker:latest
```

The commit-SHA tag is the immutable deployment identifier. Pull requests build but do not push either tag.

Expected successful Actions output includes Maven `BUILD SUCCESS`, a successful Docker Buildx build/push, and an ECR push digest, for example:

```text
[INFO] BUILD SUCCESS
...
exporting to image
...
Pushed: 100808729174.dkr.ecr.us-east-1.amazonaws.com/task-tracker:<full-git-commit-sha>
Pushed: 100808729174.dkr.ecr.us-east-1.amazonaws.com/task-tracker:latest
```

The exact Buildx log wording can vary by action version.

## Troubleshooting

- **`Not authorized to perform sts:AssumeRoleWithWebIdentity`**: the temporary OIDC diagnostic in the publish job prints only `iss`, `aud`, `sub`, `repository`, `ref`, and `event_name`, plus boolean checks for the expected account, region, ECR repository, and role ARN. It never prints the JWT. Compare the claims with the complete IAM trust policy. If the claims match the expected repository and main-branch subject but STS still denies the request, inspect the live role trust policy for additional conditions and verify its federated provider ARN and client ID/audience. Remove the temporary diagnostic after the issue is resolved.
- **ECR `AccessDenied`**: verify `ecr:GetAuthorizationToken` and the repository-scoped upload actions above are attached to the assumed role.
- **ECR repository not found**: verify `task-tracker` exists in account `100808729174` and region `us-east-1`.
- **Docker build fails to find the JAR**: verify the Maven artifact version still matches the Dockerfile copy path.
- **Port/health check mismatch**: keep the app `SERVER_PORT`, ECS container port, and ALB target-group port aligned. The supplied target group is port 8080; the default image/app port is now 8080.

No code has been pushed and no AWS resources have been created or changed. The next phase can use the SHA-tagged ECR image to configure the existing ECS cluster and ALB.
