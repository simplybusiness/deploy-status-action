# frozen_string_literal: true

require 'json'
require 'octokit'
require_relative 'simply_issue'
require_relative 'base_deploy_check'

# Check if the emergency deploy present
class PrDeployCheck < BaseDeployCheck
  def self.check_labeled_pr(config)
    label_tags = SimplyIssue.get_label_tags(config)
    return unless label_tags.include?('emergency deploy')

    sha = config.event_payload['pull_request']['head']['sha']
    result = config.client.create_status(
      config.app_repo, sha, 'success',
      description: 'You are free to deploy',
      context: context_name,
      target_url: config.event_payload['html_url']
    )
    puts "Created #{result[:state]} state with" \
         "description #{result[:description]} for sha #{sha} and url #{result[:url]}"
    puts '============================================================================================'
    result
  end
end
