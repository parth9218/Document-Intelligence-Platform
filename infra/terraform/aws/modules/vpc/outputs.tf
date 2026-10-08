output "vpc_id" { value = module.vpc.vpc_id }

output "private_subnets" {
  value = [
    for idx, id in module.vpc.private_subnets : {
      id   = id
      cidr = module.vpc.private_subnets_cidr_blocks[idx]
    }
  ]
}

output "public_subnets" {
  value = [
    for idx, id in module.vpc.public_subnets : {
      id   = id
      cidr = module.vpc.public_subnets_cidr_blocks[idx]
    }
  ]
}
