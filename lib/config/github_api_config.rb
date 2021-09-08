# frozen_string_literal: true

require 'octokit'
require 'json'

# Sets the github client and event payload
class GithubApiConfig
  def initialize
    @client = Octokit::Client.new(access_token: ENV['ISSUE_TOKEN'])
    @app_repo = Octokit::Repository.new(ENV['GITHUB_REPOSITORY'])
    @event_payload = JSON.parse(File.read(ENV['GITHUB_EVENT_PATH']))
    @event_name = ENV['GITHUB_EVENT_NAME']
    @event_branch = ENV['GITHUB_REF']
  end
  attr_reader :client, :app_repo, :event_payload, :event_name, :event_branch
end
