require 'json'
require 'octokit'

class SimplyIssue
  def self.get_label_tags(config)
    if config.event_name == 'pull_request'
      puts config.event_payload["number"]
      issue = config.client.pull_request(config.app_repo, config.event_payload["number"])
    else
      issue = config.client.issue(config.app_repo, config.event_payload["issue"]["number"])
    end
    label_tags = issue["labels"].inject([]){|memo, label| memo.push(label["name"]) }
  end
  def self.get_all_issues(config, aspect, label = nil)
    case aspect
    when "pull_request"
      config.client.pull_requests(config.app_repo, state: 'open')
    when "issues"
      config.client.list_issues(config.app_repo, state: 'open', direction: 'desc', labels: label)
    end
  end
end