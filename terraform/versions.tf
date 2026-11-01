terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.71"
    }
  }

  # Remote state (khuyến nghị cho team): tạo bucket + DynamoDB lock 1 lần rồi bỏ comment
  # và chạy `terraform init -migrate-state`.
  # backend "s3" {
  #   bucket         = "homeshop-terraform-state-<account-id>"
  #   key            = "prod/terraform.tfstate"
  #   region         = "ap-southeast-1"
  #   dynamodb_table = "homeshop-terraform-lock"
  #   encrypt        = true
  # }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = var.project_name
      Environment = var.environment
      ManagedBy   = "terraform"
      Owner       = var.owner
    }
  }
}
