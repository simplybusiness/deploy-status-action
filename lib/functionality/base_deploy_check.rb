# frozen_string_literal: true

require 'json'
require 'octokit'
require_relative 'simply_issue'

# Checks the deploy checks present
class BaseDeployCheck
  def self.base_check(config, event, sha)
    puts "config event branch  #{config.event_branch}"
    label_tags = SimplyIssue.get_label_tags(config)

    result = if SimplyIssue.get_all_issues(
      config, event,
      'block deploys'
    ).length.positive? && !label_tags.include?('emergency deploy')

               config.client.create_status(
                 config.app_repo, sha, 'failure', description: 'Deploys are blocked',
                                                  context: context_name
               )
             else
               config.client.create_status(
                 config.app_repo, sha, 'success', description: 'You are free to deploy',
                                                  context: context_name
               )
             end
    puts "Created #{result[:state]} state with description #{result[:description]}"
    print "for sha #{sha} and url #{result[:url]}"
    puts '================================================================================================'
    result
  end

  def self.context_name
    'Deploy status'
  end
end
