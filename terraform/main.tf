############################################################
# Home Shopping App - AWS Infrastructure (Terraform)
############################################################

locals {
  name        = "${var.project_name}-${var.environment}"
  bucket_name = "${local.name}-assets-${data.aws_caller_identity.current.account_id}"
}

data "aws_caller_identity" "current" {}

data "aws_partition" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

# Ubuntu 22.04 LTS (Jammy) chính chủ Canonical
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"]

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

############################################################
# Networking: VPC, Public Subnet, IGW, Route Table
############################################################

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_support   = true
  enable_dns_hostnames = true

  tags = { Name = "${local.name}-vpc" }
}

# Khóa Security Group mặc định của VPC (không rule nào) - CIS AWS Benchmark 5.4
resource "aws_default_security_group" "default" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-default-locked" }
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id
  tags   = { Name = "${local.name}-igw" }
}

resource "aws_subnet" "public" {
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidr
  availability_zone       = data.aws_availability_zones.available.names[0]
  map_public_ip_on_launch = false # IP public cố định do Elastic IP cấp

  tags = { Name = "${local.name}-public-a" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = { Name = "${local.name}-public-rt" }
}

resource "aws_route_table_association" "public" {
  subnet_id      = aws_subnet.public.id
  route_table_id = aws_route_table.public.id
}

############################################################
# Security Group - Least Privilege
# Dùng resource rule riêng lẻ: rule SSH tạm thời do GitHub Actions thêm/xóa
# sẽ không bị Terraform "dọn" mất ở lần apply sau.
############################################################

resource "aws_security_group" "web" {
  name        = "${local.name}-web-sg"
  description = "Home Shopping App - HTTP/HTTPS public, SSH & Grafana restricted"
  vpc_id      = aws_vpc.main.id

  tags = { Name = "${local.name}-web-sg" }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_vpc_security_group_ingress_rule" "http" {
  security_group_id = aws_security_group.web.id
  description       = "HTTP (redirect to HTTPS + ACME challenge)"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "https" {
  security_group_id = aws_security_group.web.id
  description       = "HTTPS"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_ingress_rule" "ssh" {
  for_each = toset(var.ssh_allowed_cidrs)

  security_group_id = aws_security_group.web.id
  description       = "SSH from trusted admin network"
  ip_protocol       = "tcp"
  from_port         = 22
  to_port           = 22
  cidr_ipv4         = each.value
}

resource "aws_vpc_security_group_ingress_rule" "grafana" {
  for_each = toset(var.grafana_allowed_cidrs)

  security_group_id = aws_security_group.web.id
  description       = "Grafana dashboard from trusted network"
  ip_protocol       = "tcp"
  from_port         = 3001
  to_port           = 3001
  cidr_ipv4         = each.value
}

# Egress chỉ HTTP/HTTPS: DNS (VPC resolver) và NTP (Amazon Time Sync) là địa chỉ link-local,
# không bị Security Group lọc → không cần mở port 53/123. Container bị chiếm cũng không thể
# mở kết nối SSH/SMTP/DB ra ngoài để lây lan hoặc gửi spam.
resource "aws_vpc_security_group_egress_rule" "web" {
  for_each = { http = 80, https = 443 }

  security_group_id = aws_security_group.web.id
  description       = "Outbound ${upper(each.key)} - apt, Docker Hub, S3, Lets Encrypt, Discord, Telegram"
  ip_protocol       = "tcp"
  from_port         = each.value
  to_port           = each.value
  cidr_ipv4         = "0.0.0.0/0"
}

############################################################
# S3 Bucket: ảnh sản phẩm (products/) + backup DB (backups/)
############################################################

resource "aws_s3_bucket" "assets" {
  bucket        = local.bucket_name
  force_destroy = false

  tags = { Name = local.bucket_name }
}

resource "aws_s3_bucket_ownership_controls" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "assets" {
  bucket                  = aws_s3_bucket.assets.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "assets" {
  bucket = aws_s3_bucket.assets.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "assets" {
  bucket = aws_s3_bucket.assets.id

  # Bản backup DB cũ hơn N ngày (mặc định 30) tự động bị xóa → tiết kiệm chi phí
  rule {
    id     = "expire-db-backups"
    status = "Enabled"

    filter {
      prefix = "backups/"
    }

    transition {
      days          = 7
      storage_class = "STANDARD_IA"
    }

    expiration {
      days = var.backup_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 1
    }
  }

  rule {
    id     = "cleanup-old-product-image-versions"
    status = "Enabled"

    filter {
      prefix = "products/"
    }

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }

  rule {
    id     = "abort-incomplete-multipart"
    status = "Enabled"

    filter {}

    abort_incomplete_multipart_upload {
      days_after_initiation = 3
    }
  }

  depends_on = [aws_s3_bucket_versioning.assets]
}

data "aws_iam_policy_document" "bucket_policy" {
  statement {
    sid     = "DenyInsecureTransport"
    effect  = "Deny"
    actions = ["s3:*"]
    resources = [
      aws_s3_bucket.assets.arn,
      "${aws_s3_bucket.assets.arn}/*",
    ]

    principals {
      type        = "*"
      identifiers = ["*"]
    }

    condition {
      test     = "Bool"
      variable = "aws:SecureTransport"
      values   = ["false"]
    }
  }
}

resource "aws_s3_bucket_policy" "assets" {
  bucket     = aws_s3_bucket.assets.id
  policy     = data.aws_iam_policy_document.bucket_policy.json
  depends_on = [aws_s3_bucket_public_access_block.assets]
}

############################################################
# IAM Role + Instance Profile cho EC2 (không cần Access Key cứng)
############################################################

data "aws_iam_policy_document" "ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ec2" {
  name               = "${local.name}-ec2-role"
  assume_role_policy = data.aws_iam_policy_document.ec2_assume.json
}

data "aws_iam_policy_document" "ec2_s3" {
  statement {
    sid       = "ListOnlyAppPrefixes"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.assets.arn]

    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["products/*", "avatars/*", "backups/*", "products/", "avatars/", "backups/"]
    }
  }

  statement {
    sid     = "ReadWriteProductImagesAndAvatars"
    actions = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = [
      "${aws_s3_bucket.assets.arn}/products/*",
      "${aws_s3_bucket.assets.arn}/avatars/*",
    ]
  }

  # Backup: chỉ được ghi & đọc (restore), KHÔNG được xóa → ransomware trên EC2 không xóa được backup
  statement {
    sid       = "WriteReadDatabaseBackups"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${aws_s3_bucket.assets.arn}/backups/*"]
  }
}

resource "aws_iam_role_policy" "ec2_s3" {
  name   = "${local.name}-s3-access"
  role   = aws_iam_role.ec2.id
  policy = data.aws_iam_policy_document.ec2_s3.json
}

# Cho phép truy cập khẩn cấp qua AWS Systems Manager Session Manager (không cần mở port 22)
resource "aws_iam_role_policy_attachment" "ssm" {
  role       = aws_iam_role.ec2.name
  policy_arn = "arn:${data.aws_partition.current.partition}:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

resource "aws_iam_instance_profile" "ec2" {
  name = "${local.name}-ec2-profile"
  role = aws_iam_role.ec2.name
}

############################################################
# GitHub Actions OIDC → role chỉ được mở/đóng port 22 tạm thời cho runner
############################################################

resource "aws_iam_openid_connect_provider" "github" {
  count = var.create_github_oidc_provider ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
}

locals {
  github_oidc_provider_arn = var.create_github_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : "arn:${data.aws_partition.current.partition}:iam::${data.aws_caller_identity.current.account_id}:oidc-provider/token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "github_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    # Chỉ workflow chạy trên nhánh main hoặc environment production của đúng repo mới assume được
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "repo:${var.github_repository}:ref:refs/heads/main",
        "repo:${var.github_repository}:environment:production",
      ]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name                 = "${local.name}-github-deploy"
  assume_role_policy   = data.aws_iam_policy_document.github_assume.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "ManageTemporarySshRuleOnAppSgOnly"
    actions   = ["ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress"]
    resources = [aws_security_group.web.arn]
  }

  statement {
    sid       = "DescribeSecurityGroups"
    actions   = ["ec2:DescribeSecurityGroups", "ec2:DescribeSecurityGroupRules"]
    resources = ["*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "${local.name}-github-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}

############################################################
# EC2 Instance + Elastic IP
############################################################

resource "aws_key_pair" "deployer" {
  key_name   = "${local.name}-deployer"
  public_key = var.ssh_public_key
}

resource "aws_instance" "app" {
  ami                     = data.aws_ami.ubuntu.id
  instance_type           = var.instance_type
  subnet_id               = aws_subnet.public.id
  vpc_security_group_ids  = [aws_security_group.web.id]
  iam_instance_profile    = aws_iam_instance_profile.ec2.name
  key_name                = aws_key_pair.deployer.key_name
  monitoring              = true
  disable_api_termination = var.enable_termination_protection
  ebs_optimized           = true

  user_data = templatefile("${path.module}/../scripts/user_data.sh", {
    project_dir  = "/opt/homeshop"
    s3_bucket    = aws_s3_bucket.assets.bucket
    aws_region   = var.aws_region
    swap_size_gb = var.swap_size_gb
  })
  user_data_replace_on_change = false

  # IMDSv2 bắt buộc (chống SSRF lấy credentials); hop limit 2 để container Docker vẫn lấy được role credentials
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required"
    http_put_response_hop_limit = 2
    instance_metadata_tags      = "enabled"
  }

  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.root_volume_size_gb
    iops                  = 3000
    throughput            = 125
    encrypted             = true
    delete_on_termination = true

    tags = { Name = "${local.name}-root" }
  }

  credit_specification {
    cpu_credits = "unlimited"
  }

  tags = { Name = "${local.name}-app" }

  lifecycle {
    ignore_changes = [ami, user_data]
  }
}

resource "aws_eip" "app" {
  domain   = "vpc"
  instance = aws_instance.app.id

  tags = { Name = "${local.name}-eip" }

  depends_on = [aws_internet_gateway.main]
}

# Tự động khôi phục EC2 khi phần cứng AWS lỗi (giữ nguyên EIP, EBS, instance ID)
resource "aws_cloudwatch_metric_alarm" "auto_recover" {
  alarm_name          = "${local.name}-ec2-auto-recover"
  alarm_description   = "Recover EC2 when the underlying host fails system status check"
  namespace           = "AWS/EC2"
  metric_name         = "StatusCheckFailed_System"
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "GreaterThanOrEqualToThreshold"
  dimensions          = { InstanceId = aws_instance.app.id }
  alarm_actions       = ["arn:${data.aws_partition.current.partition}:automate:${var.aws_region}:ec2:recover"]
}
