import React from 'react';
import useDocusaurusContext from '@docusaurus/useDocusaurusContext';
import Layout from '@theme/Layout';
import { Redirect } from '@docusaurus/router';

export default function Home(): React.JSX.Element {
  const {siteConfig} = useDocusaurusContext();
  return <Redirect to="docs/intro" />;
}
