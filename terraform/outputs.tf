output "vpc_id" {
  description = "ID của VPC"
  value       = aws_vpc.main.id
}

output "public_subnet_id" {
  description = "ID của public subnet"
  value       = aws_subnet.public.id
}

output "security_group_id" {
  description = "ID Security Group (dùng cho secret AWS_SECURITY_GROUP_ID của GitHub Actions)"
  value       = aws_security_group.web.id
}

output "instance_id" {
  description = "ID của EC2 instance"
  value       = aws_instance.app.id
}

output "elastic_ip" {
  description = "IP public cố định - trỏ DNS A record của domain về IP này"
  value       = aws_eip.app.public_ip
}

output "ssh_command" {
  description = "Lệnh SSH vào server"
  value       = "ssh -i ~/.ssh/homeshop_ed25519 ubuntu@${aws_eip.app.public_ip}"
}

output "s3_bucket_name" {
  description = "Tên bucket S3 chứa ảnh sản phẩm & backup DB"
  value       = aws_s3_bucket.assets.bucket
}

output "ec2_iam_role_arn" {
  description = "IAM role gắn vào EC2"
  value       = aws_iam_role.ec2.arn
}

output "github_deploy_role_arn" {
  description = "Role cho GitHub Actions assume qua OIDC (secret AWS_DEPLOY_ROLE_ARN)"
  value       = aws_iam_role.github_deploy.arn
}

output "grafana_url" {
  description = "URL Grafana (chỉ truy cập được từ grafana_allowed_cidrs)"
  value       = "http://${aws_eip.app.public_ip}:3001"
}
