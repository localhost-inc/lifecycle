import SwiftUI

struct AppSidebarOrganizationIdentity: Equatable {
  let name: String
  let slug: String
  let avatarLabel: String
  let avatarSymbolName: String?
  let canOpenPicker: Bool
}

struct AppSidebarUserIdentity: Equatable {
  let primaryText: String
  let secondaryText: String?
  let avatarLabel: String
  let avatarSymbolName: String?
  let avatarUrl: String?
}

func resolveAppSidebarOrganizationIdentity(
  authState: BridgeAuthState?,
  organizations: [BridgeOrganization]
) -> AppSidebarOrganizationIdentity {
  guard let authState, authState.authenticated else {
    return AppSidebarOrganizationIdentity(
      name: "Personal",
      slug: "Sign in",
      avatarLabel: "Personal",
      avatarSymbolName: "person.fill",
      canOpenPicker: false
    )
  }

  if let activeOrgSlug = nonEmptyAppSidebarText(authState.activeOrgSlug),
    let activeOrganization = organizations.first(where: { $0.slug == activeOrgSlug })
  {
    return AppSidebarOrganizationIdentity(
      name: activeOrganization.name,
      slug: activeOrganization.slug,
      avatarLabel: activeOrganization.name,
      avatarSymbolName: nil,
      canOpenPicker: !organizations.isEmpty
    )
  }

  if let firstOrganization = organizations.first {
    return AppSidebarOrganizationIdentity(
      name: firstOrganization.name,
      slug: firstOrganization.slug,
      avatarLabel: firstOrganization.name,
      avatarSymbolName: nil,
      canOpenPicker: !organizations.isEmpty
    )
  }

  if let activeOrgSlug = nonEmptyAppSidebarText(authState.activeOrgSlug) {
    return AppSidebarOrganizationIdentity(
      name: appSidebarTitle(fromSlug: activeOrgSlug),
      slug: activeOrgSlug,
      avatarLabel: activeOrgSlug,
      avatarSymbolName: nil,
      canOpenPicker: false
    )
  }

  return AppSidebarOrganizationIdentity(
    name: "Organization",
    slug: "unknown",
    avatarLabel: "Organization",
    avatarSymbolName: "person.fill",
    canOpenPicker: false
  )
}

func resolveAppSidebarUserIdentity(authState: BridgeAuthState?) -> AppSidebarUserIdentity {
  guard let authState else {
    return AppSidebarUserIdentity(
      primaryText: "Sign in",
      secondaryText: nil,
      avatarLabel: "Sign in",
      avatarSymbolName: "person.fill",
      avatarUrl: nil
    )
  }

  if authState.authenticated {
    let primaryText =
      nonEmptyAppSidebarText(authState.displayName) ??
      nonEmptyAppSidebarText(authState.email) ??
      "Signed in"
    let secondaryText =
      nonEmptyAppSidebarText(authState.email) ??
      nonEmptyAppSidebarText(authState.userId)

    return AppSidebarUserIdentity(
      primaryText: primaryText,
      secondaryText: secondaryText,
      avatarLabel: primaryText,
      avatarSymbolName: nil,
      avatarUrl: nil
    )
  }

  let gitProfile = authState.gitProfile
  let primaryText =
    nonEmptyAppSidebarText(gitProfile?.name) ??
    nonEmptyAppSidebarText(gitProfile?.login) ??
    "Signed out"
  let secondaryText =
    nonEmptyAppSidebarText(gitProfile?.login).map { "@\($0)" } ??
    nonEmptyAppSidebarText(gitProfile?.email)

  return AppSidebarUserIdentity(
    primaryText: primaryText,
    secondaryText: secondaryText,
    avatarLabel: nonEmptyAppSidebarText(gitProfile?.name) ?? primaryText,
    avatarSymbolName: gitProfile == nil ? "person.fill" : nil,
    avatarUrl: nonEmptyAppSidebarText(gitProfile?.avatarUrl)
  )
}

struct AppSidebarOrganizationHeaderView: View {
  @ObservedObject var model: AppModel
  @State private var isOrgPickerOpen = false

  private var identity: AppSidebarOrganizationIdentity {
    resolveAppSidebarOrganizationIdentity(
      authState: model.authState,
      organizations: model.organizations
    )
  }

  var body: some View {
    Group {
      if identity.canOpenPicker {
        Button {
          isOrgPickerOpen.toggle()
        } label: {
          AppSidebarIdentityRow(
            avatarLabel: identity.avatarLabel,
            avatarSymbolName: identity.avatarSymbolName,
            avatarUrl: nil,
            primaryText: identity.name,
            secondaryText: identity.slug,
            showsDisclosure: true
          )
          .padding(.horizontal, 12)
          .padding(.vertical, 10)
        }
        .buttonStyle(.plain)
        .lcPointerCursor()
        .popover(isPresented: $isOrgPickerOpen, arrowEdge: .bottom) {
          AppSidebarOrgPickerPopover(
            organizations: model.organizations,
            activeOrgSlug: identity.slug
          )
        }
      } else {
        AppSidebarIdentityRow(
          avatarLabel: identity.avatarLabel,
          avatarSymbolName: identity.avatarSymbolName,
          avatarUrl: nil,
          primaryText: identity.name,
          secondaryText: identity.slug,
          showsDisclosure: false
        )
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
      }
    }
  }
}

struct AppSidebarUserFooterView: View {
  @ObservedObject var model: AppModel

  private var identity: AppSidebarUserIdentity {
    resolveAppSidebarUserIdentity(authState: model.authState)
  }

  var body: some View {
    AppSidebarIdentityRow(
      avatarLabel: identity.avatarLabel,
      avatarSymbolName: identity.avatarSymbolName,
      avatarUrl: identity.avatarUrl,
      primaryText: identity.primaryText,
      secondaryText: identity.secondaryText,
      showsDisclosure: false
    )
  }
}

private struct AppSidebarOrgPickerPopover: View {
  @Environment(\.appTheme) private var theme

  let organizations: [BridgeOrganization]
  let activeOrgSlug: String?

  var body: some View {
    VStack(alignment: .leading, spacing: 2) {
      ForEach(organizations) { org in
        HStack(spacing: 8) {
          AppSidebarAvatarBadge(label: org.name, symbolName: nil, avatarUrl: nil, size: 22)

          VStack(alignment: .leading, spacing: 0) {
            Text(org.name)
              .font(.lc(size: 12, weight: .medium))
              .foregroundStyle(theme.primaryTextColor)
              .lineLimit(1)

            Text(org.slug)
              .font(.lc(size: 10, weight: .medium))
              .foregroundStyle(theme.mutedColor)
              .lineLimit(1)
          }

          Spacer()

          if org.slug == activeOrgSlug {
            Image(systemName: "checkmark")
              .font(.lc(size: 10, weight: .bold))
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
    .frame(minWidth: 220)
  }
}

private struct AppSidebarIdentityRow: View {
  @Environment(\.appTheme) private var theme

  let avatarLabel: String
  let avatarSymbolName: String?
  let avatarUrl: String?
  let primaryText: String
  let secondaryText: String?
  let showsDisclosure: Bool

  var body: some View {
    HStack(spacing: 10) {
      AppSidebarAvatarBadge(
        label: avatarLabel,
        symbolName: avatarSymbolName,
        avatarUrl: avatarUrl,
        size: 30
      )

      VStack(alignment: .leading, spacing: 2) {
        Text(primaryText)
          .font(.lc(size: 12, weight: .semibold))
          .foregroundStyle(theme.sidebarForegroundColor)
          .lineLimit(1)

        if let secondaryText {
          Text(secondaryText)
            .font(.lc(size: 11, weight: .medium))
            .foregroundStyle(theme.sidebarMutedForegroundColor)
            .lineLimit(1)
        }
      }

      Spacer(minLength: 8)

      if showsDisclosure {
        Image(systemName: "chevron.up.chevron.down")
          .font(.lc(size: 9, weight: .semibold))
          .foregroundStyle(theme.sidebarMutedForegroundColor)
      }
    }
    .contentShape(Rectangle())
  }
}

private struct AppSidebarAvatarBadge: View {
  @Environment(\.appTheme) private var theme

  let label: String
  let symbolName: String?
  let avatarUrl: String?
  let size: CGFloat

  private var cornerRadius: CGFloat {
    max(8, size * 0.28)
  }

  private var initials: String {
    let parts = label.split(separator: " ")
    if parts.count >= 2 {
      return String(parts[0].prefix(1) + parts[1].prefix(1)).uppercased()
    }

    return String(label.prefix(2)).uppercased()
  }

  var body: some View {
    ZStack {
      RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        .fill(theme.sidebarMutedForegroundColor.opacity(0.14))

      if let avatarUrl,
        let url = URL(string: avatarUrl)
      {
        AsyncImage(url: url) { image in
          image
            .resizable()
            .aspectRatio(contentMode: .fill)
        } placeholder: {
          Text(initials)
            .font(.lc(size: size * 0.38, weight: .semibold))
            .foregroundStyle(theme.sidebarMutedForegroundColor)
        }
        .frame(width: size, height: size)
        .clipShape(RoundedRectangle(cornerRadius: cornerRadius, style: .continuous))
      } else if let symbolName {
        Image(systemName: symbolName)
          .font(.lc(size: size * 0.4, weight: .medium))
          .foregroundStyle(theme.sidebarMutedForegroundColor)
      } else {
        Text(initials)
          .font(.lc(size: size * 0.38, weight: .semibold))
          .foregroundStyle(theme.sidebarMutedForegroundColor)
      }
    }
    .frame(width: size, height: size)
  }
}

private func nonEmptyAppSidebarText(_ value: String?) -> String? {
  guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines),
    !value.isEmpty
  else {
    return nil
  }

  return value
}

private func appSidebarTitle(fromSlug slug: String) -> String {
  let components = slug
    .split(whereSeparator: { $0 == "-" || $0 == "_" })
    .map { $0.capitalized }

  if components.isEmpty {
    return slug
  }

  return components.joined(separator: " ")
}
