# frozen_string_literal: true

require_relative 'spec_helper'
require_relative '../lib/config/github_api_config'
require_relative '../lib/functionality/simply_issue'
require_relative '../lib/functionality/pr_deploy_check'
require_relative '../lib/functionality/issue_deploy_check'
require_relative '../lib/functionality/base_deploy_check'

SPEC_FIXTURES_PATH = File.expand_path('fixtures', __dir__)

RSpec.describe 'SimplyIssue' do
  before do
    ENV['REPOSITORY'] = '/simplybusiness/chopin'
    ENV['ISSUE_TOKEN'] = 'fake_token'
  end

  let(:config) { GithubApiConfig.new }

  context 'when PR is labeled with emergency deploy tag' do
    it 'returns the emergency deploy tag' do
      ENV['GITHUB_EVENT_PATH'] = Pathname.new(SPEC_FIXTURES_PATH).join('labeled_pr_payload.json').to_s
      ENV['GITHUB_REF'] = 'ref/my/base/branch'
      ENV['GITHUB_EVENT_NAME'] = 'pull_request'
      config = GithubApiConfig.new
      VCR.use_cassette('emergency deploy update success') do
        response = SimplyIssue.get_label_tags(config)
        expect(response).to include('emergency deploy')
      end
    end
  end

  context 'when I ask for all open PRs' do
    it 'returns at least one open PR' do
      ENV['GITHUB_EVENT_PATH'] = Pathname.new(SPEC_FIXTURES_PATH).join('labeled_pr_payload.json').to_s
      ENV['GITHUB_REF'] = 'ref/my/base/branch'
      ENV['GITHUB_EVENT_NAME'] = 'pull_request'
      config = GithubApiConfig.new
      VCR.use_cassette('all prs') do
        response = SimplyIssue.get_all_issues(config, 'pull_request')
        expect(response.length).to be_positive
      end
    end
  end

  context 'when I ask for all issues with blocked_deploy tag when one exists' do
    it 'returns at least one open PR' do
      ENV['GITHUB_EVENT_PATH'] = Pathname.new(SPEC_FIXTURES_PATH).join('labeled_pr_payload.json').to_s
      ENV['GITHUB_REF'] = 'ref/my/base/branch'
      ENV['GITHUB_EVENT_NAME'] = 'pull_request'
      config = GithubApiConfig.new
      VCR.use_cassette('all issues with blocked_deploy tag') do
        response = SimplyIssue.get_all_issues(config, 'issues', 'blocked_deploy')
        expect(response.length).to be_positive
      end
    end
  end
end
