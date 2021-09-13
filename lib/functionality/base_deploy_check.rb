# frozen_string_literal: true

require 'json'
require 'octokit'
require_relative 'simply_issue'

# Checks the deploy checks present
class BaseDeployCheck
  def self.base_check(config, event, sha) # rubocop:disable Metrics/AbcSize
    puts "config event branch  #{config.event_branch}"
    result = if SimplyIssue.get_all_issues(
      config, event,
      'block deploys'
    ).length.positive?

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
