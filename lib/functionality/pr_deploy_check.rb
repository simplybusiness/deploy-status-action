# frozen_string_literal: true

require 'json'
require 'octokit'
require_relative 'simply_issue'
require_relative 'base_deploy_check'

class PrDeployCheck < BaseDeployCheck
  def self.check_labeled_pr(config)
    label_tags = SimplyIssue.get_label_tags(config)
    if label_tags.include?('override_deploy')
      result = config.client.create_status(config.app_repo, config.event_payload['pull_request']['head']['sha'],
                                           'success', description: 'You are free to deploy', context: context_name)
      puts "Created #{result[:state]} state with description #{result[:description]} for sha #{config.event_payload['pull_request']['head']['sha']} and url #{result[:url]}"
      puts '================================================================================================================================================================'
    end
  end
end
