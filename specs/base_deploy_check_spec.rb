# frozen_string_literal: true

require_relative 'spec_helper'
require_relative '../lib/config/github_api_config'
require_relative '../lib/functionality/base_deploy_check'
require_relative '../lib/functionality/pr_deploy_check'

RSpec.describe 'BaseDeployCheck' do
  before do
    ENV['GITHUB_REPOSITORY'] = 'simplybusiness/chopin'
    ENV['ISSUE_TOKEN'] = 'fake_token'
  end

  let(:config) { GithubApiConfig.new }

  context 'when there are no blocked deploy issues' do
    it 'returns a success for the deploy check' do
      ENV['GITHUB_EVENT_PATH'] = Pathname.new(SPEC_FIXTURES_PATH).join('open_pr_payload.json').to_s
      ENV['GITHUB_REF'] = 'ref/my/base/branch'
      ENV['GITHUB_EVENT_NAME'] = 'pull_request'
      sha = '63f739d5586b2c6b718045893789d620e0d0aee9'

      VCR.use_cassette('no blocked deploy update success') do
        response = PrDeployCheck.base_check(config, 'issues', sha)
        expect(response['state']).to eq('success')
      end
    end
  end
  context 'when there are blocked deploy issues' do
    it 'returns a failure for the deploy check' do
      ENV['GITHUB_EVENT_PATH'] = Pathname.new(SPEC_FIXTURES_PATH).join('open_pr_payload.json').to_s
      ENV['GITHUB_REF'] = 'ref/my/base/branch'
      ENV['GITHUB_EVENT_NAME'] = 'pull_request'
      sha = '63f739d5586b2c6b718045893789d620e0d0aee9'

      VCR.use_cassette('blocked deploy update failure') do
        response = PrDeployCheck.base_check(config, 'issues', sha)
        expect(response['state']).to eq('failure')
      end
    end
  end
end
