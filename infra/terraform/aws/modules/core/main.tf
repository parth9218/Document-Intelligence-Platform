data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  azs             = slice(data.aws_availability_zones.available.names, 0, 2)
  private_subnets = [for i, c in local.azs : cidrsubnet(var.vpc_cidr, 8, i + 1)]
  public_subnets  = [for i, c in local.azs : cidrsubnet(var.vpc_cidr, 8, i + 101)]
}

module "vpc" {
  source          = "../vpc"
  project_name    = var.project_name
  environment     = var.environment
  vpc_cidr        = var.vpc_cidr
  public_subnets  = local.public_subnets
  private_subnets = local.private_subnets
  azs             = local.azs
}

module "secrets" {
  source       = "../secrets"
  project_name = var.project_name
  environment  = var.environment
  db_name      = var.db_name
  db_username  = var.db_username
  db_host      = module.storage.db_address
  db_port      = module.storage.db_port
  s3_bucket    = module.storage.documents_bucket_id
  sqs_url      = module.messaging.sqs_queue_url
  dlq_url      = module.messaging.dlq_url
}

module "storage" {
  source                 = "../storage"
  project_name           = var.project_name
  environment            = var.environment
  vpc_id                 = module.vpc.vpc_id
  private_subnets        = module.vpc.private_subnets
  db_name                = var.db_name
  db_user_name           = var.db_username
  region                 = data.aws_region.current.region
  account_id             = data.aws_caller_identity.current.account_id
  github_actions_ci_role = module.oidc.github_actions_ci_role_arn
}

module "oidc" {
  source          = "../oidc"
  project_name    = var.project_name
  environment     = var.environment
  github_username = var.github_username
  github_repo     = var.github_repo
}

module "ecr" {
  source       = "../ecr"
  project_name = var.project_name
  environment  = var.environment
  ci_role_arn  = module.oidc.github_actions_ci_role_arn
}

module "eks" {
  source               = "../eks"
  project_name         = var.project_name
  environment          = var.environment
  vpc_id               = module.vpc.vpc_id
  private_subnet_ids   = [for subnet in module.vpc.private_subnets : subnet.id]
  db_credentials_arn   = module.storage.db_password_secret
  ecr_repo_arns        = module.ecr.ecr_repo_arns
  documents_sqs_arn    = module.messaging.sqs_queue_arn
  documents_bucket_arn = module.storage.documents_bucket_arn
  dbi_resource_id      = module.storage.dbi_resource_id
  db_username          = var.db_username
}

module "messaging" {
  source               = "../messaging"
  project_name         = var.project_name
  environment          = var.environment
  documents_bucket_id  = module.storage.documents_bucket_id
  documents_bucket_arn = module.storage.documents_bucket_arn
}

module "acm" {
  source       = "../acm"
  project_name = var.project_name
  environment  = var.environment
  api_hostname = var.api_hostname
}


resource "null_resource" "db_grant" {
  depends_on = [
    module.eks,
    module.storage.db_address
  ]

  triggers = {
    db_endpoint = module.storage.db_address
  }

  provisioner "local-exec" {
    command = <<EOT
      echo "Configuring kubectl for EKS cluster..."
      aws eks update-kubeconfig --name ${module.eks.cluster_name} --region ${data.aws_region.current.region}

      echo "Generating RDS IAM Auth token since master password is disabled for rds_iam users..."
      PASSWORD=$(aws secretsmanager get-secret-value --secret-id '${module.storage.db_password_secret}' --query SecretString --output text | jq -r '.password')
      
      JOB_NAME="${var.project_name}-${var.environment}-db-grant"
      
      echo "Deploying Kubernetes Job to execute SQL grants..."
      kubectl create secret generic db-grant-token --from-literal=PGPASSWORD="$PASSWORD" --dry-run=client -o yaml | kubectl apply -f -
      # Temporarily use the api's service account to apply the grants
      # We will create a dedicated service account for the API deployment later
      kubectl create sa "${var.project_name}-${var.environment}-api-sa" --dry-run=client -o yaml | kubectl apply -f -

      cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: $JOB_NAME
  namespace: default
spec:
  ttlSecondsAfterFinished: 30
  backoffLimit: 2
  template:
    spec:
      serviceAccountName: "${var.project_name}-${var.environment}-api-sa"
      containers:
      - name: psql
        image: postgres:alpine
        envFrom:
        - secretRef:
            name: db-grant-token
        command: ["/bin/sh", "-c"]
        args:
        - |
          wget -qO /tmp/global-bundle.pem https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
          psql "host=${module.storage.db_address} port=${module.storage.db_port} user=${var.db_username} dbname=${var.db_name} sslmode=verify-full sslrootcert=/tmp/global-bundle.pem" -c "GRANT rds_iam TO ${var.db_username}; GRANT CONNECT ON DATABASE ${var.db_name} TO ${var.db_username}; CREATE EXTENSION IF NOT EXISTS vector SCHEMA public;"
      restartPolicy: Never
EOF
      
      echo "Waiting for Job to complete..."
      kubectl wait --for=condition=complete job/$JOB_NAME --timeout=60s || { echo "Job failed!"; kubectl logs job/$JOB_NAME; exit 1; }
      echo "Grants applied successfully!"
      kubectl logs job/$JOB_NAME
      kubectl delete job $JOB_NAME
      kubectl delete secret db-grant-token
      kubectl delete sa ${var.project_name}-${var.environment}-api-sa
    EOT
  }
}
