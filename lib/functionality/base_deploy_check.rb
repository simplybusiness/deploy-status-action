# frozen_string_literal: true

require 'json'
require 'octokit'
require_relative 'simply_issue'

# Checks the deploy checks present
class BaseDeployCheck
  def self.base_check(config, event, sha)
    puts "config event branch  #{config.event_branch}"
    result = if SimplyIssue.block_deploys?(config, event)
               config.client.create_status(
                 config.app_repo, sha, 'failure',
                 description: 'Deploys are blocked',
                 options: {context: context_name, target_url: config.event_payload['html_url']}
               )
             else
               config.client.create_status(
                 config.app_repo, sha, 'success',
                 description: 'You are free to deploy',
                 options: { context: context_name, target_url: config.event_payload['html_url'] }
               )
             end
    puts "Created #{result[:state]} state with description #{result[:description]}"
    print "for sha #{sha} and url #{result[:url]}"
    puts '========================================================================='
    result
  end

  def self.context_name
    'Deploy status'
  end
end
