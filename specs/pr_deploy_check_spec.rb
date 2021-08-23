# frozen_string_literal: true

require_relative 'spec_helper'
require_relative '../lib/config/github_api_config'
require_relative '../lib/functionality/simply_issue'
require_relative '../lib/functionality/pr_deploy_check'
require_relative '../lib/functionality/issue_deploy_check'
require_relative '../lib/functionality/base_deploy_check'

RSpec.describe PrDeployCheck do
  SPEC_FIXTURES_PATH = File.expand_path('fixtures', __dir__)
  puts(SPEC_FIXTURES_PATH)
  context 'when pr is labeled with emergency deploy tag' do
    before do
      ENV['REPOSITORY'] = '/simplybusiness/chopin'
      ENV['ISSUE_TOKEN'] = 'fake_token'
      ENV['GITHUB_EVENT_PATH'] = Pathname.new(SPEC_FIXTURES_PATH).join('labeled_pr_payload.json').to_s
      ENV['GITHUB_REF'] = 'ref/my/base/branch'
      ENV['GITHUB_EVENT_NAME'] = 'pull_request'
    end

    it 'returns a success for the deploy check' do
      config =  GithubApiConfig.new
      VCR.use_cassette('override deploy update success') do
        response = PrDeployCheck.check_labeled_pr(config)
        expect(response['state']).to eq('success')
      end
    end
  end
end
