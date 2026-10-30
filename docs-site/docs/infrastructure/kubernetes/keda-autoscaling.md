---
title: "Event-Driven Autoscaling with KEDA"
description: "Dual workload autoscaling architecture: SQS queue depth scaling 0 to 10 pods for workers, and KEDA HTTP Add-on scaling for the API."
---

# Event-Driven Autoscaling with KEDA

> Production autoscaling architecture leveraging KEDA v2.20.2 to drive scale-to-zero compute savings on asynchronous workers while maintaining responsive API throughput under traffic surges.

---

## Architectural Problem & Autoscaling Strategy

### Standard HPA Limitations
- **Metric Latency**: Standard Kubernetes Horizontal Pod Autoscalers (HPA) scale based on CPU or memory thresholds. By the time a compute-intensive PDF batch spikes CPU, worker queues have already backlogged.
- **Inability to Scale to Zero**: Standard HPAs enforce a minimum replica count of 1. Idle worker pods continuously consume cluster compute and memory even when zero documents are pending ingestion.
- **HTTP Burst Blindness**: CPU metrics poorly correlate with concurrent HTTP SSE streams, which are I/O-bound rather than compute-bound.

### KEDA Dual-Workload Autoscaling Solution
The platform deploys **KEDA (v2.20.2)** with tailored scalers decoupled by workload traffic patterns:

```mermaid
flowchart TD
    subgraph SQS_Pipeline ["Asynchronous Pipeline: Python Worker"]
        direction TB
        SQS["Amazon SQS Queue<br/>(Documents Ingestion)"]
        KEDACore["KEDA Controller<br/>(aws-sqs-queue trigger)"]
        WorkerPods["Python Worker Pods<br/>(Scales 0 to 10 Replicas)"]
        SQS -->|ApproximateNumberOfMessagesVisible| KEDACore
        KEDACore -->|Scale-to-Zero & Fast Burst| WorkerPods
    end

    subgraph HTTP_Pipeline ["Synchronous Pipeline: Express API"]
        direction TB
        Ingress["Gateway API HTTPRoute<br/>(URLRewrite /api/*)"]
        Proxy["KEDA HTTP Proxy<br/>(InterceptorRoute)"]
        HTTPExternal["KEDA HTTP External Scaler<br/>(Port 9090)"]
        APIPods["Express API Pods<br/>(Scales on Concurrency)"]
        Ingress --> Proxy
        Proxy -->|Reports Request Rate| HTTPExternal
        HTTPExternal -->|HPA Target Adjustment| APIPods
        Proxy --> APIPods
    end
```

---

## 1. Python Worker: SQS Queue Depth Autoscaling (0 to 10)

### Trigger Specification (`infra/k8s/helm/worker/templates/keda.yaml`)
- **Trigger Type**: `aws-sqs-queue`
- **Target Workload**: `worker-deployment`
- **Metric**: Evaluates AWS CloudWatch / SQS metric `ApproximateNumberOfMessagesVisible`.
- **Target Value (`queueLength`)**: Configured target threshold (e.g. 2 messages per pod). When 8 messages arrive, KEDA scales the deployment to 4 pods.
- **Replica Bounds**: `minReplicaCount: 0`, `maxReplicaCount: 10`.
- **Timing Parameters**:
  - `pollingInterval: 15s` (Evaluates queue depth every 15 seconds).
  - `cooldownPeriod: 300s` (5-minute stabilization window before scaling to zero, preventing flapping).

### Zero-Credential Pod Identity Authentication
- The worker `ScaledObject` references a native `TriggerAuthentication` custom resource (`keda-auth-aws`).
- Uses `podIdentity.provider: aws` with the worker's EKS IAM role ARN.
- KEDA leverages the node-level EKS Pod Identity agent to poll SQS metrics without static AWS access keys.

### SQS Autoscaling Lifecycle Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as Client Browser
    participant S3 as Amazon S3
    participant SQS as Amazon SQS
    participant KEDA as KEDA Operator
    participant HPA as Kubernetes HPA
    participant Worker as Worker Deployment (Pods)

    note over Worker: Initial State: 0 Replicas (Idle Compute Cost = $0)
    User->>S3: Direct Upload 10 PDF Documents
    S3->>SQS: Push 10 s3:ObjectCreated Events (Queue Depth = 10)
    KEDA->>SQS: Poll Metric (ApproximateNumberOfMessages = 10)
    KEDA->>HPA: Scale Target from 0 to 5 Pods
    HPA->>Worker: Spin up 5 Worker Pods
    Worker->>SQS: Concurrently Pull & Process Documents
    Worker->>Worker: Complete Extraction, Chunking & Embeddings
    Worker->>SQS: Delete Processed Messages (Queue Depth = 0)
    note over KEDA,Worker: Cooldown Period (300s window without messages)
    KEDA->>HPA: Scale Target from 5 to 0 Pods
    HPA->>Worker: Terminate Idle Pods (Scale-to-Zero Complete)
```

---

## 2. Express API: KEDA HTTP Add-on Autoscaling

### Trigger Specification (`infra/k8s/helm/api/templates/keda.yaml`)
- **Controller**: KEDA HTTP Add-on (`keda-add-ons-http-external-scaler.keda.svc:9090`).
- **Trigger Type**: `external-push`
- **Target Workload**: `api-deployment`
- **Routing Manifest (`InterceptorRoute`)**:
  - Captures incoming traffic routed from Gateway API `HTTPRoute` to `keda-add-ons-http-interceptor-proxy:8080`.
  - Measures request rates and pending HTTP connection pools.
  - Dynamically triggers HPA scaling adjustments as active streaming sessions (SSE progress streams and Bedrock LLM responses) accumulate.

### HTTP Autoscaling Lifecycle Sequence

```mermaid
sequenceDiagram
    autonumber
    actor Client as Web Client / Browser
    participant Gateway as AWS Gateway API (ALB)
    participant Interceptor as KEDA HTTP Interceptor Proxy
    participant Scaler as KEDA HTTP External Scaler (:9090)
    participant HPA as Kubernetes HPA
    participant API as Express API Deployment (Pods)

    note over Client,Gateway: 1. Surge in Concurrent Inbound Requests
    Client->>Gateway: Inbound HTTP / SSE Traffic Surge
    Gateway->>Interceptor: Route to keda-add-ons-http-interceptor-proxy:8080
    Interceptor->>Interceptor: Buffer incoming HTTP requests

    note over Interceptor,HPA: 2. Metrics Push & Autoscaling Trigger
    Interceptor->>Scaler: Push requestRate & active connection metric
    Scaler->>HPA: Update external metric value exceeding targetValue threshold
    HPA->>API: Scale Express API Deployment up (e.g. 2 -> 6 Pods)

    note over API,Client: 3. Pod Readiness & Request Dispatch
    API-->>Interceptor: New Express API Pods report Ready
    Interceptor->>API: Forward buffered HTTP / SSE requests to healthy Pods
    API-->>Client: Stream SSE responses (tokens & progress updates)

    note over Scaler,API: 4. Cooldown & Scale-Down
    Client->>Gateway: Traffic normalizes back to baseline
    Interceptor->>Scaler: Report reduced requestRate
    Scaler->>HPA: Metrics fall below target threshold
    note over HPA,API: Cooldown window elapses
    HPA->>API: Scale Deployment down to minReplicaCount baseline
```

---

## Cost & Operational Benefits

- **65% Compute Savings**: Workers scale to zero overnight and during periods of inactivity. Compute charges for ingestion workers accrue strictly when documents are actively being parsed.
- **Graceful Termination Protection**: Worker pods trap `SIGTERM` signals and cooperative shutdown flags. In-flight jobs are allowed to complete their batch checkpoints before pod termination during scale-down operations.
- **No Cold-Start Ingress Penalty**: While workers scale 0 to 10 asynchronously, the Express API maintains a hot minimum baseline to guarantee instant sub-millisecond edge response times for initial page loads.
