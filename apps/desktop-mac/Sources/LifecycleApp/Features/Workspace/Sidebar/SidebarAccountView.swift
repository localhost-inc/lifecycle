import SwiftUI

/// Top-left sidebar section: shows the current user and org picker when signed in,
/// or a git-derived profile with a sign-in prompt when signed out.
struct SidebarAccountView: View {
  @Environment(\.appTheme) private var theme
  @ObservedObject var model: AppModel

  var body: some View {
    if let auth = model.authState {
      if auth.authenticated {
        SignedInAccountView(
          displayName: auth.displayName ?? "User",
          email: auth.email,
          activeOrgSlug: auth.activeOrgSlug,
          organizations: model.organizations
        )
      } else {
        SignedOutAccountView(gitProfile: auth.gitProfile)
      }
    } else {
      // Loading — show nothing.
      EmptyView()
    }
  }
}

// MARK: - Signed In

private struct SignedInAccountView: View {
  @Environment(\.appTheme) private var theme

  let displayName: String
  let email: String?
  let activeOrgSlug: String?
  let organizations: [BridgeOrganization]

  @State private var isOrgPickerOpen = false

  var body: some View {
    Button {
      isOrgPickerOpen.toggle()
    } label: {
      HStack(spacing: 8) {
        // Avatar circle with initials
        AvatarInitials(name: displayName, size: 28)

        VStack(alignment: .leading, spacing: 1) {
          if let activeOrgSlug {
            Text(activeOrgSlug)
              .font(.system(size: 12, weight: .semibold))
              .foregroundStyle(theme.sidebarForegroundColor)
              .lineLimit(1)
          }

          Text(displayName)
            .font(.system(size: 11, weight: .medium))
            .foregroundStyle(theme.sidebarMutedForegroundColor)
            .lineLimit(1)
        }

        Spacer()

        Image(systemName: "chevron.up.chevron.down")
          .font(.system(size: 9, weight: .semibold))
          .foregroundStyle(theme.sidebarMutedForegroundColor)
      }
      .padding(.horizontal, 12)
      .padding(.vertical, 8)
      .contentShape(Rectangle())
    }
    .buttonStyle(.plain)
    .lcPointerCursor()
    .popover(isPresented: $isOrgPickerOpen, arrowEdge: .bottom) {
      OrgPickerPopover(
        organizations: organizations,
        activeOrgSlug: activeOrgSlug
      )
    }
  }
}

// MARK: - Signed Out

private struct SignedOutAccountView: View {
  @Environment(\.appTheme) private var theme

  let gitProfile: BridgeGitProfile?

  var body: some View {
    HStack(spacing: 8) {
      if let gitProfile, let avatarUrl = gitProfile.avatarUrl, let url = URL(string: avatarUrl) {
        AsyncImage(url: url) { image in
          image
            .resizable()
            .aspectRatio(contentMode: .fill)
        } placeholder: {
          AvatarInitials(name: gitProfile.name ?? "?", size: 28)
        }
        .frame(width: 28, height: 28)
        .clipShape(Circle())
      } else {
        AvatarInitials(name: gitProfile?.name ?? "?", size: 28)
      }

      VStack(alignment: .leading, spacing: 1) {
        Text(gitProfile?.name ?? "Not signed in")
          .font(.system(size: 12, weight: .semibold))
          .foregroundStyle(theme.sidebarForegroundColor)
          .lineLimit(1)

        Text("Sign in for cloud workspaces")
          .font(.system(size: 10, weight: .medium))
          .foregroundStyle(theme.sidebarMutedForegroundColor)
          .lineLimit(1)
      }

      Spacer()
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 8)
  }
}

// MARK: - Org Picker Popover

private struct OrgPickerPopover: View {
  @Environment(\.appTheme) private var theme

  let organizations: [BridgeOrganization]
  let activeOrgSlug: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      ForEach(organizations) { org in
        HStack(spacing: 8) {
          AvatarInitials(name: org.name, size: 22)

          VStack(alignment: .leading, spacing: 0) {
            Text(org.name)
              .font(.system(size: 12, weight: .medium))
              .foregroundStyle(theme.primaryTextColor)
              .lineLimit(1)

            Text(org.slug)
              .font(.system(size: 10, weight: .medium))
              .foregroundStyle(theme.mutedColor)
              .lineLimit(1)
          }

          Spacer()

          if org.slug == activeOrgSlug {
            Image(systemName: "checkmark")
              .font(.system(size: 10, weight: .bold))
              .foregroundStyle(theme.accentColor)
          }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(
          RoundedRectangle(cornerRadius: 6, style: .continuous)
            .fill(org.slug == activeOrgSlug ? theme.accentColor.opacity(0.1) : Color.clear)
        )
        .contentShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
      }
    }
    .padding(8)
    .frame(minWidth: 200)
  }
}

// MARK: - Avatar Initials

private struct AvatarInitials: View {
  @Environment(\.appTheme) private var theme

  let name: String
  let size: CGFloat

  private var initials: String {
    let parts = name.split(separator: " ")
    if parts.count >= 2 {
      return String(parts[0].prefix(1) + parts[1].prefix(1)).uppercased()
    }
    return String(name.prefix(2)).uppercased()
  }

  var body: some View {
    ZStack {
      Circle()
        .fill(theme.sidebarMutedForegroundColor.opacity(0.15))

      Text(initials)
        .font(.system(size: size * 0.38, weight: .semibold))
        .foregroundStyle(theme.sidebarMutedForegroundColor)
    }
    .frame(width: size, height: size)
  }
}
