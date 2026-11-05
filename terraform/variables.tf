variable "aws_region" {
  description = "AWS region triển khai (Singapore gần Việt Nam nhất)"
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Tiền tố đặt tên tài nguyên"
  type        = string
  default     = "homeshop"

  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{2,20}$", var.project_name))
    error_message = "project_name chỉ gồm chữ thường, số, dấu gạch ngang (3-21 ký tự)."
  }
}

variable "environment" {
  description = "Tên môi trường"
  type        = string
  default     = "prod"

  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment phải là dev, staging hoặc prod."
  }
}

variable "owner" {
  description = "Người chịu trách nhiệm tài nguyên (tag Owner)"
  type        = string
  default     = "devops-student"
}

variable "vpc_cidr" {
  description = "CIDR của VPC"
  type        = string
  default     = "10.20.0.0/16"
}

variable "public_subnet_cidr" {
  description = "CIDR của public subnet"
  type        = string
  default     = "10.20.1.0/24"
}

variable "instance_type" {
  description = "Loại EC2"
  type        = string
  default     = "t3.medium"
}

variable "root_volume_size_gb" {
  description = "Dung lượng EBS root (GB)"
  type        = number
  default     = 30

  validation {
    condition     = var.root_volume_size_gb >= 20 && var.root_volume_size_gb <= 200
    error_message = "root_volume_size_gb phải trong khoảng 20-200."
  }
}

variable "swap_size_gb" {
  description = "Dung lượng swap tạo trong user_data"
  type        = number
  default     = 4
}

variable "ssh_public_key" {
  description = "Nội dung public key SSH (ssh-ed25519 ...) dùng cho user ubuntu"
  type        = string
  sensitive   = true
}

variable "ssh_allowed_cidrs" {
  description = "Danh sách CIDR được SSH (IP nhà/trường). GitHub Actions được mở tạm thời qua OIDC role."
  type        = list(string)

  validation {
    condition     = alltrue([for c in var.ssh_allowed_cidrs : can(cidrhost(c, 0))]) && !contains(var.ssh_allowed_cidrs, "0.0.0.0/0")
    error_message = "ssh_allowed_cidrs phải là CIDR hợp lệ và KHÔNG được là 0.0.0.0/0."
  }
}

variable "grafana_allowed_cidrs" {
  description = "Danh sách CIDR được truy cập Grafana port 3001"
  type        = list(string)

  validation {
    condition     = alltrue([for c in var.grafana_allowed_cidrs : can(cidrhost(c, 0))]) && !contains(var.grafana_allowed_cidrs, "0.0.0.0/0")
    error_message = "grafana_allowed_cidrs phải là CIDR hợp lệ và KHÔNG được là 0.0.0.0/0."
  }
}

variable "backup_retention_days" {
  description = "Số ngày giữ bản backup DB trên S3 trước khi tự xóa"
  type        = number
  default     = 30
}

variable "github_repository" {
  description = "Repository GitHub dạng owner/repo, dùng cho OIDC trust policy của role deploy"
  type        = string

  validation {
    condition     = can(regex("^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", var.github_repository))
    error_message = "github_repository phải có dạng owner/repo."
  }
}

variable "github_oidc_sub_prefix" {
  description = "Tiền tố sub OIDC dạng immutable (gh api repos/<owner>/<repo>/actions/oidc/customization/sub → sub_claim_prefix). Để trống nếu repo dùng sub dạng cũ."
  type        = string
  default     = ""

  validation {
    condition     = var.github_oidc_sub_prefix == "" || can(regex("^repo:[^:*]+$", var.github_oidc_sub_prefix))
    error_message = "github_oidc_sub_prefix phải có dạng repo:owner@<id>/repo@<id> (không chứa ':' hay '*' phía sau)."
  }
}

variable "create_github_oidc_provider" {
  description = "Tạo OIDC provider token.actions.githubusercontent.com (mỗi account chỉ có 1; đặt false nếu đã tồn tại)"
  type        = bool
  default     = true
}

variable "enable_termination_protection" {
  description = "Bật chống xóa nhầm EC2"
  type        = bool
  default     = false
}
