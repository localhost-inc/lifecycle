FROM node:22-slim

RUN apt-get update && apt-get install -y \
    git curl unzip ca-certificates openssh-client jq tmux bubblewrap \
    && rm -rf /var/lib/apt/lists/*

SHELL ["/bin/bash", "-lc"]

# Install bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:$PATH"

# Install Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Install Codex CLI
RUN npm install -g @openai/codex

# Shell/runtime layout
RUN useradd -m -d /home/lifecycle -s /bin/bash lifecycle || true
RUN mkdir -p /home/lifecycle /workspace
COPY lifecycle-cloud.sh /etc/profile.d/lifecycle-cloud.sh
RUN chmod 0644 /etc/profile.d/lifecycle-cloud.sh \
  && printf '\n[ -f /etc/profile.d/lifecycle-cloud.sh ] && . /etc/profile.d/lifecycle-cloud.sh\n' >> /etc/bash.bashrc

WORKDIR /workspace
