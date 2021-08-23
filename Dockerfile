FROM ruby:2.6.5

LABEL "com.github.actions.name"="Deploy Issue Workflow"
LABEL "com.github.actions.description"="Check if deploy is blocked"
LABEL "com.github.actions.icon"="filter"
LABEL "com.github.actions.color"="red"

RUN mkdir -p /action
COPY . /action
RUN chmod +x /action/entrypoint.sh

ENTRYPOINT ["/action/entrypoint.sh"]
