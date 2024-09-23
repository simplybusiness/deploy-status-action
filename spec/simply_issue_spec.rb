# frozen_string_literal: true

require_relative 'spec_helper'
require_relative '../lib/config/github_api_config'
require_relative '../lib/functionality/simply_issue'
require_relative '../lib/functionality/pr_deploy_check'
require_relative '../lib/functionality/issue_deploy_check'
require_relative '../lib/functionality/base_deploy_check'

RSpec.describe 'SimplyIssue' do
  before do
    ENV['GITHUB_REPOSITORY'] = 'simplybusiness/important-app'
    ENV['CLIENT_ID'] = 'client_id'
    ENV['PRIVATE_KEY'] = JWT::JWK.new(OpenSSL::PKey::RSA.new(2048)).keypair.to_pem
  end

  let(:config) { GithubApiConfig.new }

  context 'when PR is labeled with emergency deploy tag' do
    it 'returns the emergency deploy tag' do
      ENV['GITHUB_EVENT_PATH'] = Pathname.new(SPEC_FIXTURES_PATH).join('labeled_pr_payload.json').to_s
      ENV['GITHUB_REF'] = 'ref/heads/test-branch'
      ENV['GITHUB_EVENT_NAME'] = 'pull_request'
      VCR.use_cassette('emergency deploy update success') do
        config = GithubApiConfig.new
        response = SimplyIssue.get_label_tags(config)
        expect(response).to include('emergency deploy')
      end
    end
  end

  context 'when I ask for all open PRs' do
    it 'returns at least one open PR' do
      ENV['GITHUB_EVENT_PATH'] = Pathname.new(SPEC_FIXTURES_PATH).join('labeled_pr_payload.json').to_s
      ENV['GITHUB_REF'] = 'ref/heads/test-branch'
      ENV['GITHUB_EVENT_NAME'] = 'pull_request'
      VCR.use_cassette('all prs') do
        config = GithubApiConfig.new
        response = SimplyIssue.get_all_issues(config, 'pull_request')
        expect(response.length).to be_positive
      end
    end
  end

  context 'when I ask for all issues with blocked_deploy tag when one exists' do
    it 'returns at least one open PR' do
      ENV['GITHUB_EVENT_PATH'] = Pathname.new(SPEC_FIXTURES_PATH).join('labeled_pr_payload.json').to_s
      ENV['GITHUB_REF'] = 'ref/heads/test-branch'
      ENV['GITHUB_EVENT_NAME'] = 'issues'
      VCR.use_cassette('all issues with blocked_deploy tag') do
        config = GithubApiConfig.new
        response = SimplyIssue.get_all_issues(config, 'issues', 'block deploys')
        expect(response.length).to be_positive
      end
    end
  end
end
