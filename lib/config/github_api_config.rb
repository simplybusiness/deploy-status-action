# frozen_string_literal: true

require 'octokit'
require 'json'

# Sets the github client and event payload
class GithubApiConfig
  def initialize
    @client = if ENV['ISSUE_TOKEN'] && !ENV['ISSUE_TOKEN'].empty?
                Octokit::Client.new(access_token: ENV['ISSUE_TOKEN'])
              else
                Octokit::Client.new(
                  client_id: ENV.fetch('CLIENT_ID'),
                  client_secret: ENV.fetch('CLIENT_SECRET')
                )
              end
    @app_repo = Octokit::Repository.new(ENV.fetch('GITHUB_REPOSITORY'))
    @event_payload = JSON.parse(File.read(ENV.fetch('GITHUB_EVENT_PATH')))
    @event_name = ENV.fetch('GITHUB_EVENT_NAME')
    @event_branch = ENV.fetch('GITHUB_REF')
  end
  attr_reader :client, :app_repo, :event_payload, :event_name, :event_branch
end
