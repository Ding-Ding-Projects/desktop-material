import * as React from 'react'
import classNames from 'classnames'
import { encodePathAsUrl } from '../../lib/path'
import {
  appBrandStyleToCss,
  appLogoStyleToCss,
  appNameStyleToCss,
  getAppLogoInitial,
  IAppIdentityCustomization,
} from '../../models/app-identity'
import { Octicon } from '../octicons/octicon'
import { OcticonSymbol } from '../octicons'
import * as octicons from '../octicons/octicons.generated'

interface IAppBrandProps {
  readonly identity: IAppIdentityCustomization
  readonly className?: string
  readonly preview?: boolean
}

function getLogoSymbol(identity: IAppIdentityCustomization): OcticonSymbol {
  switch (identity.logo) {
    case 'repository':
      return octicons.repo
    case 'terminal':
      return octicons.terminal
    case 'code':
      return octicons.code
    case 'sparkle':
      return octicons.sparkle
    case 'github':
    case 'monogram':
    case 'custom':
      return octicons.markGithub
  }
}

/** The shared live brand used by both the Windows title bar and its preview. */
export class AppBrand extends React.Component<IAppBrandProps> {
  private onCustomLogoError = (
    event: React.SyntheticEvent<HTMLImageElement>
  ) => {
    event.currentTarget.hidden = true
  }

  public render() {
    const { identity } = this.props
    const showMonogram = identity.logo === 'monogram'
    const customLogoPath =
      identity.logo === 'custom' ? identity.customLogoPath : null

    return (
      <span
        className={classNames('app-brand-container', this.props.className, {
          'app-brand-preview': this.props.preview,
        })}
        style={appBrandStyleToCss(identity)}
        data-customization-surface="app-identity"
        data-customization-label="App identity"
        data-customization-scope="profile"
      >
        {identity.showLogo && (
          <span
            className="app-brand-logo"
            style={appLogoStyleToCss(identity)}
            aria-hidden={true}
          >
            {showMonogram ? (
              <span className="app-brand-monogram">
                {getAppLogoInitial(identity.displayName)}
              </span>
            ) : (
              <Octicon className="app-icon" symbol={getLogoSymbol(identity)} />
            )}
            {customLogoPath !== null && (
              <img
                key={customLogoPath}
                className="app-brand-custom-logo"
                src={encodePathAsUrl(customLogoPath)}
                alt=""
                onError={this.onCustomLogoError}
              />
            )}
          </span>
        )}
        <span className="app-brand" style={appNameStyleToCss(identity)}>
          {identity.displayName}
        </span>
      </span>
    )
  }
}
